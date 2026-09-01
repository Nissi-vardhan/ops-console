import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { getShareByDoc, upsertShare, deleteShare } from '@/lib/ops-shares';
import { googleConfigured } from '@/lib/google-verify';

// Manage the Google-gated share link for a doc (ops-authorized).

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const share = await getShareByDoc((await params).id);
   return NextResponse.json({ share, googleConfigured: googleConfigured() });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const body = await request.json().catch(() => ({}));
   const user = await getOpsUser();
   const share = await upsertShare((await params).id, body?.allowed_emails, user?.id ?? null);
   return NextResponse.json({ share });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ ok: await deleteShare((await params).id) });
}
