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
import { createPushKey, listPushKeys, revokePushKey } from '@/lib/kb-push';

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
// POST { action: 'key_create', ws, label } / { action: 'key_revoke', ws, id } → KB push keys
// POST { action: 'bulk_live', ws, ids } → make all those articles live (Needs review tab)
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
   const [{ docs, counts }, gaps, keys] = await Promise.all([
      listKbAdmin(ws, filter, q, audience),
      kbGapsFor(ws),
      listPushKeys(ws),
   ]);
   return NextResponse.json({ docs, counts: { ...counts, gaps: gaps.length }, gaps, keys });
}

export async function POST(request: Request) {
   const denied = await ownerOnly();
   if (denied) return denied;
   const body = await request.json().catch(() => null);
   if (body?.action === 'resolve') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      return NextResponse.json({ ok: true, resolved: await resolveGaps(ids) });
   }
   // Push keys (SC-437): let an outside team push KB articles into one product (always staging).
   if (body?.action === 'key_create') {
      const ws = typeof body.ws === 'string' ? body.ws : '';
      if (!WORKSPACES.some((w) => w.slug === ws))
         return NextResponse.json({ error: 'Unknown product' }, { status: 400 });
      const user = await getOpsUser();
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      const { key, token } = await createPushKey(
         ws,
         label || 'push key',
         user?.username ?? 'owner'
      );
      return NextResponse.json({ ok: true, key, token });
   }
   if (body?.action === 'key_revoke') {
      const ws = typeof body.ws === 'string' ? body.ws : '';
      const id = typeof body.id === 'string' ? body.id : '';
      if (!(await revokePushKey(ws, id)))
         return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ ok: true });
   }
   if (body?.action === 'audience') {
      const id = typeof body.id === 'string' ? body.id : '';
      const audience = body.audience === 'marketing' ? 'marketing' : 'support';
      if (!(await setKbAudience(id, audience)))
         return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ ok: true, audience });
   }
   // Bulk approve (owner only): make every listed article of one product live.
   if (body?.action === 'bulk_live') {
      const ws = typeof body.ws === 'string' ? body.ws : '';
      const ids: string[] = Array.isArray(body.ids)
         ? body.ids.filter((x: unknown) => typeof x === 'string')
         : [];
      if (!ids.length || ids.length > 200)
         return NextResponse.json({ error: '1–200 articles' }, { status: 400 });
      const user = await getOpsUser();
      let done = 0;
      const failed: string[] = [];
      for (const id of ids) {
         const doc = await getOpsDoc(id);
         if (
            !doc ||
            doc.category !== 'KB' ||
            doc.workspace !== ws ||
            doc.review_stage === 'approved'
         ) {
            failed.push(id);
            continue;
         }
         const res = await setDocReview(id, {
            stage: 'approved',
            note: 'Set live with "Make all live" on the Knowledge Base page',
            author_name: user?.username ?? 'owner',
            author_email: user?.email ?? '',
         });
         if (res) done++;
         else failed.push(id);
      }
      return NextResponse.json({ ok: true, done, failed });
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
