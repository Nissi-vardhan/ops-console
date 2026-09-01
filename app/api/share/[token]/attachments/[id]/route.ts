import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { cookies } from 'next/headers';
import { getShareByToken } from '@/lib/ops-shares';
import { readShareToken, SHARE_COOKIE } from '@/lib/share-session';
import { getAttachment } from '@/lib/ops-attachments';
import { getObjectStream } from '@/lib/storage';

// Stream an attachment to a share viewer — only if they hold a valid share
// cookie for the token AND the attachment belongs to that shared doc.
export async function GET(
   _request: Request,
   { params }: { params: Promise<{ token: string; id: string }> }
) {
   const { token, id } = await params;
   const share = await getShareByToken(token);
   if (!share) return new NextResponse('Not found', { status: 404 });
   const store = await cookies();
   const email = await readShareToken(store.get(SHARE_COOKIE)?.value, token);
   if (!email) return new NextResponse('Unauthorized', { status: 401 });

   const att = await getAttachment(id);
   if (!att || att.doc_id !== share.doc_id) return new NextResponse('Not found', { status: 404 });
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
