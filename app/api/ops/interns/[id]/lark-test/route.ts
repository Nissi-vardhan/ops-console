import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { findIntern } from '@/lib/ops-interns';
import { sendLarkToHook } from '@/lib/lark';

// POST /api/ops/interns/:id/lark-test — send a test message to the intern's Lark group.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const intern = (await findIntern(decodeURIComponent((await params).id))) as {
      name: string;
      lark_webhook?: string;
      lark_secret?: string;
   } | null;
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!intern.lark_webhook)
      return NextResponse.json({ error: 'no Lark webhook set' }, { status: 400 });
   const r = await sendLarkToHook(
      intern.lark_webhook,
      intern.lark_secret || '',
      '🔔 Task updates are connected to this group.'
   );
   return r.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: r.error }, { status: 502 });
}
