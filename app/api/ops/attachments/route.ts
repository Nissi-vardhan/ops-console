import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { opsAuthorized, requireRole } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { putObject, storageConfigured } from '@/lib/storage';
import { createAttachment, listAttachments, listIssueAttachments } from '@/lib/ops-attachments';
import { resolveOpsIssueId } from '@/lib/ops-data';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

// GET /api/ops/attachments?doc=<docId> | ?issue=<CL-12|uuid>  → list a doc's / task's attachments
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const sp = new URL(request.url).searchParams;
   const issueRef = sp.get('issue');
   if (issueRef) {
      const issueId = await resolveOpsIssueId(issueRef);
      if (!issueId) return NextResponse.json({ error: 'task not found' }, { status: 404 });
      return NextResponse.json({
         attachments: await listIssueAttachments(issueId),
         storageConfigured: storageConfigured(),
      });
   }
   const docId = sp.get('doc') ?? '';
   if (!docId) return NextResponse.json({ error: 'doc or issue required' }, { status: 400 });
   return NextResponse.json({
      attachments: await listAttachments(docId),
      storageConfigured: storageConfigured(),
   });
}

// POST multipart { file, doc_id? | issue_id? } → upload to object storage
export async function POST(request: Request) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   if (!storageConfigured())
      return NextResponse.json(
         { error: 'Object storage not configured (set MINIO_*).' },
         { status: 400 }
      );

   const form = await request.formData().catch(() => null);
   const file = form?.get('file');
   const docId = (form?.get('doc_id') as string) || null;
   const issueRef = (form?.get('issue_id') as string) || null;
   const issueId = issueRef ? await resolveOpsIssueId(issueRef) : null;
   if (issueRef && !issueId) return NextResponse.json({ error: 'task not found' }, { status: 404 });
   if (!(file instanceof File)) return NextResponse.json({ error: 'no file' }, { status: 400 });

   const buf = Buffer.from(await file.arrayBuffer());
   if (buf.length > MAX_BYTES)
      return NextResponse.json({ error: 'file too large (max 25 MB)' }, { status: 413 });

   const ct = file.type || 'application/octet-stream';
   const safe = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
   const key = `ops/attachments/${randomUUID()}/${safe}`;
   await putObject(key, buf, ct);

   const user = await getOpsUser();
   const att = await createAttachment({
      doc_id: docId,
      issue_id: issueId,
      filename: file.name || safe,
      content_type: ct,
      size: buf.length,
      object_key: key,
      created_by: user?.id ?? null,
   });
   return NextResponse.json({ attachment: { id: att.id, filename: att.filename, size: att.size } });
}
