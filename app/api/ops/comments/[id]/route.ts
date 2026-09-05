import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { deleteComment } from '@/lib/ops-comments';

// DELETE a comment (ops-authorized internal users can remove any).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   return NextResponse.json({ ok: await deleteComment((await params).id) });
}
