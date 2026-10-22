import { NextResponse } from 'next/server';
import { getOpsUser } from '@/lib/ops-session';
import { getOpsDoc, setDocReview, setKbAudience } from '@/lib/ops-data';
import {
   kbGapsFor,
   listKbAdmin,
   resolveGaps,
   type KbAudienceFilter,
   type KbFilter,
} from '@/lib/ops-kb-admin';
import { WORKSPACES } from '@/lib/workspaces';

// Knowledge Base manager (SC-418). Owners only, signed in: the CLI/session bearer is
// refused here, because the Live switch changes production (same rule as docs review).
async function ownerOnly(): Promise<Response | null> {
   const u = await getOpsUser();
   if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   if (u.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return null;
}

// GET  ?ws=<product>&filter=all|live|review&q=  → { docs, counts, gaps }
// POST { action: 'toggle', id, live }            → set an article live (production) or back to review
// POST { action: 'resolve', ids }               → mark unanswered questions as handled
// POST { action: 'audience', id, audience }      → support (bots may use it) or marketing (team only)
export async function GET(request: Request) {
   const denied = await ownerOnly();
   if (denied) return denied;
   const sp = new URL(request.url).searchParams;
   const ws = sp.get('ws') || '';
   if (!WORKSPACES.some((w) => w.slug === ws))
      return NextResponse.json({ error: 'Unknown product' }, { status: 400 });
   const f = sp.get('filter');
   const filter: KbFilter = f === 'live' || f === 'review' ? f : 'all';
   const q = (sp.get('q') || '').trim().slice(0, 200);
   const a = sp.get('audience');
   const audience: KbAudienceFilter = a === 'support' || a === 'marketing' ? a : 'all';
   const [{ docs, counts }, gaps] = await Promise.all([
      listKbAdmin(ws, filter, q, audience),
      kbGapsFor(ws),
   ]);
   return NextResponse.json({ docs, counts: { ...counts, gaps: gaps.length }, gaps });
}

export async function POST(request: Request) {
   const denied = await ownerOnly();
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   if (body?.action === 'resolve') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      return NextResponse.json({ ok: true, resolved: await resolveGaps(ids) });
   }
   if (body?.action === 'audience') {
      const id = typeof body.id === 'string' ? body.id : '';
      const audience = body.audience === 'marketing' ? 'marketing' : 'support';
      if (!(await setKbAudience(id, audience)))
         return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ ok: true, audience });
   }
   if (body?.action === 'toggle') {
      const id = typeof body.id === 'string' ? body.id : '';
      const doc = await getOpsDoc(id);
      if (!doc || doc.category !== 'KB')
         return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const user = await getOpsUser();
      const res = await setDocReview(id, {
         stage: body.live ? 'approved' : 'review',
         note: body.live
            ? 'Set live from the Knowledge Base page'
            : 'Taken off live from the Knowledge Base page',
         author_name: user?.username ?? 'ops',
         author_email: user?.email ?? '',
      });
      if (!res) return NextResponse.json({ error: 'Could not update' }, { status: 400 });
      return NextResponse.json({
         ok: true,
         id: res.doc?.id ?? id,
         live: res.doc?.review_stage === 'approved',
      });
   }
   return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
