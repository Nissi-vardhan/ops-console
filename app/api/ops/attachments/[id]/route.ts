import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import {
   opsAuthorized,
   accessibleWorkspaces,
   docAccessDenied,
   issueAccessDenied,
} from '@/lib/ops-guard';
import { getAttachment } from '@/lib/ops-attachments';
import { getObjectStream } from '@/lib/storage';

// Stream an attachment inline (ops-authorized).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request))) return new NextResponse('Unauthorized', { status: 401 });
   const att = await getAttachment((await params).id);
   if (!att) return new NextResponse('Not found', { status: 404 });
   // Intern files and untargeted uploads are staff-only; doc/task files follow the record.
   const forbidden =
      (att.issue_id && (await issueAccessDenied(att.issue_id))) ||
      (att.doc_id && (await docAccessDenied(att.doc_id))) ||
      (!att.issue_id && !att.doc_id && (await accessibleWorkspaces()) !== null);
   if (forbidden) return new NextResponse('Forbidden', { status: 403 });
   try {
      const node = await getObjectStream(att.object_key);
      const web = Readable.toWeb(node) as unknown as ReadableStream;
      return new NextResponse(web, {
         headers: {
            'Content-Type': att.content_type,
            'Content-Disposition': `inline; filename="${att.filename.replace(/["\\]/g, '')}"`,
            'Cache-Control': 'private, max-age=300',
         },
      });
   } catch {
      return new NextResponse('Unavailable', { status: 502 });
   }
}
