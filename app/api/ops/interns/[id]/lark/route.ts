import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { findIntern } from '@/lib/ops-interns';
import { sendLarkToHook } from '@/lib/lark';

// POST /api/ops/interns/:id/lark { text } — post a message to the intern's Lark
// group through its bot (`ops lark`). The webhook never leaves the server.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const text = typeof body?.text === 'string' ? body.text.trim() : '';
   if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
   if (text.length > 4000)
      return NextResponse.json({ error: 'text is too long (max 4000)' }, { status: 400 });
   const intern = (await findIntern(decodeURIComponent((await params).id))) as {
      name: string;
      lark_webhook?: string;
      lark_secret?: string;
   } | null;
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!intern.lark_webhook)
      return NextResponse.json({ error: 'no Lark webhook set' }, { status: 400 });
   const r = await sendLarkToHook(intern.lark_webhook, intern.lark_secret || '', text);
   return r.ok
      ? NextResponse.json({ ok: true, intern: intern.name })
      : NextResponse.json({ error: r.error }, { status: 502 });
}
