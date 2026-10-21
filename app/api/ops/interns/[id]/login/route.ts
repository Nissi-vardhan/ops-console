import { NextResponse } from 'next/server';
import { getOpsUser } from '@/lib/ops-session';
import { findIntern } from '@/lib/ops-interns';
import { disableInternLogin, internLoginInfo, resetInternLogin } from '@/lib/intern-portal';

// Intern page login (SC-430). Signed-in owners only: the CLI/session bearer can't create or
// read intern passwords.
// GET  → { login_name, enabled, password_set_at }
// POST { action: 'reset' }   → creates or resets it; the password is in the response ONCE
// POST { action: 'disable' } → turns it off and signs the intern out
async function ownerOnly(): Promise<Response | null> {
   const u = await getOpsUser();
   if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   if (u.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await ownerOnly();
   if (denied) return denied;
   const intern = await findIntern(decodeURIComponent((await params).id));
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json(await internLoginInfo(intern.id));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await ownerOnly();
   if (denied) return denied;
   const intern = await findIntern(decodeURIComponent((await params).id));
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const b = await request.json().catch(() => null);
   if (b?.action === 'disable') {
      await disableInternLogin(intern.id);
      return NextResponse.json({ ok: true });
   }
   if (b?.action === 'reset') return NextResponse.json(await resetInternLogin(intern.id));
   return NextResponse.json({ error: 'action must be reset or disable' }, { status: 400 });
}
