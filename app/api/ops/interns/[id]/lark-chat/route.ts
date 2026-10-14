import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { findIntern } from '@/lib/ops-interns';
import { bindLarkChat } from '@/lib/lark-inbox';

// POST /api/ops/interns/:id/lark-chat { chat_id } — bind a Lark group to this intern
// (its messages land on his task); empty chat_id unbinds.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const intern = await findIntern(decodeURIComponent((await params).id));
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const body = await request.json().catch(() => null);
   const chatId = typeof body?.chat_id === 'string' ? body.chat_id.trim() : '';
   if (chatId && !/^oc_[A-Za-z0-9]+$/.test(chatId))
      return NextResponse.json({ error: 'chat_id looks wrong (oc_…)' }, { status: 400 });
   await bindLarkChat(intern.id, chatId);
   return NextResponse.json({ ok: true, intern: intern.name, chat_id: chatId });
}
