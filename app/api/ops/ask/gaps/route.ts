import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { kbGaps, resolveGap } from '@/lib/ops-ask';

// GET /api/ops/ask/gaps — questions the KB couldn't answer (admin+).
// POST { id } — mark one as handled (an article was written, or it's not needed).
export async function GET(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   return NextResponse.json({ gaps: await kbGaps() });
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   const id = typeof body?.id === 'string' || typeof body?.id === 'number' ? String(body.id) : '';
   if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
   return NextResponse.json({ ok: await resolveGap(id) });
}
