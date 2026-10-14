import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { larkChats } from '@/lib/lark-inbox';

// GET /api/ops/lark/chats — Lark groups the app bot has heard from, and which intern each is bound to.
export async function GET(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json({ chats: await larkChats() });
}
