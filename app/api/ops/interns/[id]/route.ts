import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { internProfile, updateIntern } from '@/lib/ops-interns';

// GET /api/ops/interns/:id — `id` is the intern's uuid or name. Their tasks, each
// with its PDFs sent, EOD summaries and reviews (oldest first).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const profile = await internProfile(decodeURIComponent((await params).id));
   if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json(profile);
}

// PATCH /api/ops/interns/:id { lark_webhook?, lark_secret?, active?, notes? } (owner/admin).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const b = await request.json().catch(() => ({}));
   const hook = typeof b?.lark_webhook === 'string' ? b.lark_webhook.trim() : undefined;
   if (
      hook &&
      !/^https:\/\/open\.(larksuite\.com|feishu\.cn)\/open-apis\/bot\/v2\/hook\/[\w-]+$/.test(hook)
   )
      return NextResponse.json(
         { error: 'lark_webhook must be a Lark custom-bot URL (…/open-apis/bot/v2/hook/…)' },
         { status: 400 }
      );
   const intern = await updateIntern(decodeURIComponent((await params).id), {
      lark_webhook: hook,
      lark_secret: typeof b?.lark_secret === 'string' ? b.lark_secret.trim() : undefined,
      active: typeof b?.active === 'boolean' ? b.active : undefined,
      notes: typeof b?.notes === 'string' ? b.notes : undefined,
   });
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({
      ok: true,
      lark_connected: !!(intern as { lark_webhook?: string }).lark_webhook,
   });
}
