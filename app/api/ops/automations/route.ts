import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import {
   automationInputError,
   automationMeta,
   computeAll,
   createAutomation,
} from '@/lib/ops-automations';

// GET /api/ops/automations?product=&category=&customer=1&money=1&status= — the
// registry with live status (owner/admin or CLI bearer). POST adds a row.
export async function GET(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const sp = new URL(request.url).searchParams;
   const { rows } = await computeAll();
   const counts: Record<string, Record<string, number>> = {};
   for (const r of rows) {
      counts[r.product] ??= {};
      counts[r.product][r.status] = (counts[r.product][r.status] ?? 0) + 1;
      if (r.doc_status === 'silent-risk')
         counts[r.product]['silent-risk'] = (counts[r.product]['silent-risk'] ?? 0) + 1;
   }
   const filtered = rows.filter(
      (r) =>
         (!sp.get('product') || r.product === sp.get('product')) &&
         (!sp.get('category') || r.category === sp.get('category')) &&
         (!sp.get('status') || r.status === sp.get('status')) &&
         (sp.get('customer') !== '1' || r.customer === 'yes') &&
         (sp.get('money') !== '1' || !!r.money)
   );
   return NextResponse.json({ automations: filtered, counts, meta: await automationMeta() });
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
   if (
      !body ||
      typeof body.product !== 'string' ||
      typeof body.name !== 'string' ||
      !body.name.trim()
   )
      return NextResponse.json({ error: 'product and name are required' }, { status: 400 });
   const err = automationInputError(body);
   if (err) return NextResponse.json({ error: err }, { status: 400 });
   const me = await getOpsUser();
   const automation = await createAutomation(body, me?.username || 'cli');
   return NextResponse.json({ automation }, { status: 201 });
}
