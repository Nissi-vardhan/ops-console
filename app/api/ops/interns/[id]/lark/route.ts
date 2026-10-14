import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { findIntern } from '@/lib/ops-interns';
import { sendLarkToHook } from '@/lib/lark';
import { query } from '@/lib/db';
import { resolveOpsIssueId } from '@/lib/ops-data';
import { larkMessages } from '@/lib/lark-inbox';

// POST /api/ops/interns/:id/lark { text, task? } — post a message to the intern's Lark
// group through its bot (`ops lark`). The webhook never leaves the server. With `task`,
// replies in the group are noted on that task from now on.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const text = typeof body?.text === 'string' ? body.text.trim() : '';
   if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
   if (text.length > 4000)
      return NextResponse.json({ error: 'text is too long (max 4000)' }, { status: 400 });
   const intern = (await findIntern(decodeURIComponent((await params).id))) as {
      id: string;
      name: string;
      lark_webhook?: string;
      lark_secret?: string;
   } | null;
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!intern.lark_webhook)
      return NextResponse.json({ error: 'no Lark webhook set' }, { status: 400 });
   let taskId: string | null = null;
   if (typeof body?.task === 'string' && body.task.trim()) {
      taskId = await resolveOpsIssueId(body.task.trim());
      if (!taskId) return NextResponse.json({ error: 'task not found' }, { status: 404 });
   }
   const r = await sendLarkToHook(intern.lark_webhook, intern.lark_secret || '', text);
   if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
   if (taskId)
      await query('UPDATE ops_interns SET lark_task_id = $1 WHERE id = $2', [taskId, intern.id]);
   return NextResponse.json({ ok: true, intern: intern.name });
}

// GET /api/ops/interns/:id/lark?task=&limit= — messages people posted in the group.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const intern = await findIntern(decodeURIComponent((await params).id));
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const sp = new URL(request.url).searchParams;
   let taskId: string | null = null;
   if (sp.get('task')) {
      taskId = await resolveOpsIssueId(sp.get('task')!);
      if (!taskId) return NextResponse.json({ error: 'task not found' }, { status: 404 });
   }
   const limit = Math.min(500, Math.max(1, Number(sp.get('limit')) || 50));
   return NextResponse.json({
      intern: intern.name,
      chat_bound: !!(intern as { lark_chat_id?: string }).lark_chat_id,
      messages: await larkMessages(intern.id, taskId, limit),
   });
}
