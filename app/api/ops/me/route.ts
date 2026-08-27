import { NextResponse } from 'next/server';
import { getOpsUser } from '@/lib/ops-session';

// The signed-in ops user (so 'My Issues' can filter to the real current user).
export async function GET() {
   const user = await getOpsUser();
   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ user: { id: user.id, email: user.email, username: user.username, role: user.role } });
}
