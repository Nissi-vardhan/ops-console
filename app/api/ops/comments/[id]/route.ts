import { NextResponse } from 'next/server';
import { requireRole, opsBearerOk } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { deleteComment } from '@/lib/ops-comments';

// DELETE a comment. Owners, admins and the CLI can remove any; members only their own.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const id = (await params).id;
   const u = opsBearerOk(request) ? null : await getOpsUser();
   const staff = !u || u.role === 'owner' || u.role === 'admin';
   return NextResponse.json({ ok: await deleteComment(id, staff ? undefined : u.email) });
}
