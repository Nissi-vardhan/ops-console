import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireRole } from '@/lib/ops-guard';
import { revokeUserKey } from '@/lib/intern-api';

// DELETE /api/ops/users/:id/keys/:keyId — revoke a member key (stops working at once). Owner/admin.
export async function DELETE(
   request: Request,
   { params }: { params: Promise<{ id: string; keyId: string }> }
) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const { id, keyId } = await params;
   const user = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE id::text = $1 OR lower(email) = lower($1)',
      [decodeURIComponent(id)]
   );
   if (!user || !/^[0-9a-f-]{36}$/i.test(keyId))
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const ok = await revokeUserKey(user.id, keyId);
   return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'key not found or already revoked' }, { status: 404 });
}
