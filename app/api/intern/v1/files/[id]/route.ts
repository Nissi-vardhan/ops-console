import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { authIntern, canReadFile } from '@/lib/intern-api';
import { getAttachment } from '@/lib/ops-attachments';
import { getObjectStream } from '@/lib/storage';

// GET /api/intern/v1/files/{id} — download a file on one of your tasks or a doc you can see.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const intern = await authIntern(request);
   if (!intern) return NextResponse.json({ error: 'missing or invalid API key' }, { status: 401 });
   const { id } = await params;
   if (!(await canReadFile(intern, id)))
      return NextResponse.json({ error: 'file not found' }, { status: 404 });
   const att = await getAttachment(id);
   if (!att) return NextResponse.json({ error: 'file not found' }, { status: 404 });
   try {
      const web = Readable.toWeb(
         await getObjectStream(att.object_key)
      ) as unknown as ReadableStream;
      return new NextResponse(web, {
         headers: {
            'Content-Type': att.content_type,
            'Content-Disposition': `attachment; filename="${att.filename.replace(/["\\\r\n]/g, '')}"`,
            'Cache-Control': 'private, no-store',
         },
      });
   } catch {
      return NextResponse.json({ error: 'file temporarily unavailable' }, { status: 502 });
   }
}
