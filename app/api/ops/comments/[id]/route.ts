import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { deleteComment } from '@/lib/ops-comments';

// DELETE a comment (ops-authorized internal users can remove any).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ ok: await deleteComment((await params).id) });
}
