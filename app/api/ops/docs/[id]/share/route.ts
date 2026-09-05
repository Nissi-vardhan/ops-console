import { NextResponse } from 'next/server';
import {
   opsAuthorized,
   requireRole,
   accessibleWorkspaces,
   workspaceAllowed,
} from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { getOpsDoc } from '@/lib/ops-data';
import { getShareByDoc, upsertShare, deleteShare } from '@/lib/ops-shares';
import { googleConfigured } from '@/lib/google-verify';

// Manage the Google-gated share link for a doc (ops-authorized).

// The share is addressed by doc id, so scope by the parent doc's workspace to
// prevent cross-workspace IDOR. A missing doc keeps existing behavior (its
// workspace resolves to null → treated as untagged → visible).
async function docForbidden(id: string): Promise<boolean> {
   const doc = await getOpsDoc(id);
   return !workspaceAllowed(await accessibleWorkspaces(), doc?.workspace ?? null);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = (await params).id;
   if (await docForbidden(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const share = await getShareByDoc(id);
   return NextResponse.json({ share, googleConfigured: googleConfigured() });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const id = (await params).id;
   if (await docForbidden(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const body = await request.json().catch(() => ({}));
   const user = await getOpsUser();
   const share = await upsertShare(id, body?.allowed_emails, user?.id ?? null);
   return NextResponse.json({ share });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const id = (await params).id;
   if (await docForbidden(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return NextResponse.json({ ok: await deleteShare(id) });
}
