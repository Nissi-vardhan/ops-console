import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { internProfile } from '@/lib/ops-interns';

// GET /api/ops/interns/:id — `id` is the intern's uuid or name. Their tasks, each
// with its PDFs sent, EOD summaries and reviews (oldest first).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const profile = await internProfile(decodeURIComponent((await params).id));
   if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json(profile);
}
