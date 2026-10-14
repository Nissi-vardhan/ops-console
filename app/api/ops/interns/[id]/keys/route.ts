import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { findIntern } from '@/lib/ops-interns';
import { createInternKey, listInternKeys } from '@/lib/intern-api';

// GET /api/ops/interns/:id/keys — the intern's API keys (prefix only).
// POST — create a key; the full token is in the response ONCE.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const intern = await findIntern(decodeURIComponent((await params).id));
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ keys: await listInternKeys(intern.id) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const intern = await findIntern(decodeURIComponent((await params).id));
   if (!intern) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json(await createInternKey(intern.id), { status: 201 });
}
