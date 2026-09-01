import { NextResponse } from 'next/server';
import { opsAuthorized } from '@/lib/ops-guard';
import { getPending } from '@/lib/ops-pending';
import { listRecentComments } from '@/lib/ops-comments';
import { recentFailures, n8nConfigured } from '@/lib/n8n';

interface Item {
   id: string;
   kind: 'blocker' | 'comment' | 'workflow';
   title: string;
   detail?: string;
   at: string;
   href?: string;
}

// Aggregated notifications feed: open blockers + recent comments + failed n8n runs.
export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

   const items: Item[] = [];

   try {
      const { snapshot, updated_at } = await getPending();
      const at = updated_at || snapshot?.as_of || new Date().toISOString();
      (snapshot?.blockers ?? []).forEach((b, i) => {
         if (b.status === 'done') return;
         const detail = [b.owner, b.eta, b.detail].filter(Boolean).join(' · ');
         items.push({
            id: `blk-${i}`,
            kind: 'blocker',
            title: b.label,
            detail: detail || undefined,
            at,
         });
      });
   } catch {
      /* pending optional */
   }

   try {
      for (const c of await listRecentComments(8)) {
         items.push({
            id: `cmt-${c.id}`,
            kind: 'comment',
            title: `${c.author_name || c.author_email || 'Someone'} commented`,
            detail: c.body.slice(0, 120),
            at: c.created_at,
         });
      }
   } catch {
      /* comments optional */
   }

   if (n8nConfigured()) {
      try {
         for (const f of await recentFailures(8)) {
            items.push({
               id: `wf-${f.id}`,
               kind: 'workflow',
               title: `${f.name} failed`,
               detail: 'Workflow run errored',
               at: f.at,
               href: '/workflows',
            });
         }
      } catch {
         /* n8n optional */
      }
   }

   items.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
   return NextResponse.json({ items: items.slice(0, 30) });
}
