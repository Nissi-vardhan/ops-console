import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authIntern, InternApiError, type InternRow } from '@/lib/intern-api';
import { putObject, storageConfigured } from '@/lib/storage';
import { createAttachment } from '@/lib/ops-attachments';

// Shared plumbing for /api/intern/v1/* routes: auth with the intern's personal
// key, uniform JSON errors, and file uploads (PDF / images / text, ≤ 25 MB).

export async function withIntern(
   request: Request,
   handler: (intern: InternRow) => Promise<unknown>
): Promise<NextResponse> {
   const intern = await authIntern(request);
   if (!intern)
      return NextResponse.json(
         { error: 'missing or invalid API key (Authorization: Bearer <key>)' },
         { status: 401 }
      );
   try {
      const data = await handler(intern);
      return data instanceof NextResponse ? data : NextResponse.json(data);
   } catch (e) {
      if (e instanceof InternApiError)
         return NextResponse.json({ error: e.message }, { status: e.status });
      console.error('[intern-api]', e);
      return NextResponse.json({ error: 'internal error' }, { status: 500 });
   }
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
   const b = await request.json().catch(() => null);
   if (!b || typeof b !== 'object') throw new InternApiError('JSON body required');
   return b as Record<string, unknown>;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = [
   'application/pdf',
   'image/png',
   'image/jpeg',
   'image/webp',
   'text/markdown',
   'text/plain',
   'text/csv',
];

/** Store an uploaded file (multipart field "file") on a task or one of his docs. */
export async function uploadFile(
   request: Request,
   intern: InternRow,
   target: { issue_id?: string; doc_id?: string }
) {
   if (!storageConfigured())
      throw new InternApiError('file storage is not available right now', 503);
   const form = await request.formData().catch(() => null);
   const file = form?.get('file');
   if (!(file instanceof File)) throw new InternApiError('multipart field "file" is required');
   const buf = Buffer.from(await file.arrayBuffer());
   if (!buf.length) throw new InternApiError('file is empty');
   if (buf.length > MAX_BYTES) throw new InternApiError('file too large (max 25 MB)', 413);
   const name = file.name || 'file';
   let ct = file.type || '';
   if (!ct || ct === 'application/octet-stream') {
      const ext = name.toLowerCase().split('.').pop() ?? '';
      ct =
         {
            pdf: 'application/pdf',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            md: 'text/markdown',
            txt: 'text/plain',
            csv: 'text/csv',
         }[ext] ?? ct;
   }
   if (!ALLOWED.includes(ct))
      throw new InternApiError('allowed: PDF, PNG, JPG, WEBP, Markdown, TXT, CSV', 415);
   const safe = name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
   const key = `ops/attachments/${randomUUID()}/${safe}`;
   await putObject(key, buf, ct);
   const att = await createAttachment({
      issue_id: target.issue_id ?? null,
      doc_id: target.doc_id ?? null,
      intern_id: intern.id,
      filename: name.slice(0, 200),
      content_type: ct,
      size: buf.length,
      object_key: key,
   });
   return {
      id: att.id,
      name: att.filename,
      size: att.size,
      type: ct,
      url: `/api/intern/v1/files/${att.id}`,
   };
}
