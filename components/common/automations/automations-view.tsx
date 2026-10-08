'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bot, ChevronDown, ChevronRight, RefreshCw, Send } from 'lucide-react';
import { EmptyState } from '@/components/brand/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { WORKSPACES } from '@/lib/workspaces';

// Automation tab (SC-255): everything that runs on its own, its live status, run
// history the console keeps itself, "while you were away", and the §5 risks.

type Status = 'on-time' | 'late' | 'failing' | 'off' | 'unknown';
interface Row {
   id: string;
   product: string;
   category: string;
   name: string;
   what: string;
   trigger_text: string;
   kind: string;
   cadence_min: number | null;
   customer: 'yes' | 'group' | 'no';
   money: string;
   where_text: string;
   n8n_ids: string[];
   feed: string;
   watched_by: string;
   owner: string;
   intended_off: boolean;
   doc_status: string;
   notes: string;
   status: Status;
   reason: string;
   last_run: string | null;
   last_success: string | null;
   next_due: string | null;
   missed_7d: number;
   runs_ok_7d: number;
   runs_err_7d: number;
}
interface Meta {
   n8n_tz: string;
   n8n_configured: boolean;
   poll: { at: string; ok: boolean; error?: string; skipped?: string } | null;
   history_from: string | null;
   feeds: { crm: boolean; tracker: boolean; coolify: boolean };
   dm_configured: boolean;
   summary: { date: string; at: string; ok: boolean; error?: string } | null;
}
interface Away {
   since: string;
   totals: { ran: number; runs_ok: number; runs_err: number };
   failed: {
      id: string;
      name: string;
      product: string;
      err: number;
      ok: number;
      last_err: string | null;
   }[];
   missed: { id: string; name: string; product: string; slots: string[] }[];
   changes: {
      automation_id: string;
      name: string;
      product: string;
      at: string;
      from_status: string;
      to_status: string;
      reason: string;
   }[];
   ran: { id: string; name: string; product: string; ok: number; err: number }[];
}
interface Risk {
   id: string;
   priority: string;
   risk: string;
   impact: string;
   owner: string;
   decision: string;
   done_at: string | null;
   done_by: string;
}

const STATUS: Record<Status, { dot: string; label: string; cls: string }> = {
   'on-time': { dot: '🟢', label: 'On time', cls: 'text-emerald-600 dark:text-emerald-400' },
   'late': { dot: '🟡', label: 'Late', cls: 'text-amber-600 dark:text-amber-400' },
   'failing': { dot: '🔴', label: 'Failing', cls: 'text-red-600 dark:text-red-400' },
   'off': { dot: '⚪', label: 'Off', cls: 'text-muted-foreground' },
   'unknown': { dot: '❔', label: 'Unknown', cls: 'text-muted-foreground' },
};
const ORDER: Status[] = ['failing', 'late', 'unknown', 'on-time', 'off'];
const productName = (slug: string) => WORKSPACES.find((w) => w.slug === slug)?.name ?? slug;
/** Products in the console's usual order (Chesslang first), unknown ones last. */
const byProductOrder = <T,>(entries: [string, T][]) => {
   const rank = (slug: string) => {
      const i = WORKSPACES.findIndex((w) => w.slug === slug);
      return i === -1 ? 99 : i;
   };
   return [...entries].sort((a, b) => rank(a[0]) - rank(b[0]));
};

const ist = (v: string | null) =>
   v
      ? new Date(v).toLocaleString('en-GB', {
           timeZone: 'Asia/Kolkata',
           day: 'numeric',
           month: 'short',
           hour: '2-digit',
           minute: '2-digit',
           hourCycle: 'h23',
        })
      : '–';

async function send(url: string, method: string, body?: unknown) {
   const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
   }).catch(() => null);
   const d = await r?.json().catch(() => null);
   if (!r?.ok) toast.error(d?.error || 'Request failed');
   return r?.ok ? d : null;
}

export function AutomationsView() {
   const [rows, setRows] = useState<Row[]>([]);
   const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
   const [meta, setMeta] = useState<Meta | null>(null);
   const [loading, setLoading] = useState(true);
   const [forbidden, setForbidden] = useState(false);
   const [view, setView] = useState<'all' | 'away' | 'risks'>('all');
   const [product, setProduct] = useState('');
   const [status, setStatus] = useState<Status | ''>('');
   const [customerOnly, setCustomerOnly] = useState(false);
   const [moneyOnly, setMoneyOnly] = useState(false);
   const [open, setOpen] = useState<string | null>(null);

   const load = useCallback(async () => {
      const r = await fetch('/api/ops/automations', { cache: 'no-store' }).catch(() => null);
      if (r?.status === 403) setForbidden(true);
      const d = r?.ok ? await r.json() : null;
      setRows(d?.automations ?? []);
      setCounts(d?.counts ?? {});
      setMeta(d?.meta ?? null);
      setLoading(false);
   }, []);
   useEffect(() => {
      load();
   }, [load]);

   const shown = useMemo(
      () =>
         rows.filter(
            (r) =>
               (!product || r.product === product) &&
               (!status || r.status === status) &&
               (!customerOnly || r.customer === 'yes') &&
               (!moneyOnly || !!r.money)
         ),
      [rows, product, status, customerOnly, moneyOnly]
   );
   const grouped = useMemo(() => {
      const m = new Map<string, Map<string, Row[]>>();
      for (const r of shown) {
         if (!m.has(r.product)) m.set(r.product, new Map());
         const c = m.get(r.product)!;
         if (!c.has(r.category)) c.set(r.category, []);
         c.get(r.category)!.push(r);
      }
      return new Map(byProductOrder([...m.entries()]));
   }, [shown]);

   if (forbidden)
      return (
         <div className="p-4 sm:p-6">
            <EmptyState title="Owners and admins only." />
         </div>
      );

   const total = (s: Status) => rows.filter((r) => r.status === s).length;

   return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
         <PageHeader
            icon={Bot}
            title="Automations"
            subtitle="Everything that runs on its own — what happens if we sleep for a day or a week. Times in IST."
            actions={
               <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                     const d = await send('/api/ops/automations/poll', 'POST');
                     if (d) toast.success(d.skipped ? `Polled (${d.skipped})` : 'Polled');
                     load();
                  }}
               >
                  <RefreshCw className="size-4" /> Poll now
               </Button>
            }
         />

         {/* top strip */}
         <div className="flex flex-wrap gap-2 text-sm">
            {ORDER.map((s) => (
               <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(status === s ? '' : s)}
                  className={`min-h-9 rounded-lg border px-3 ${status === s ? 'border-primary bg-primary/10' : 'bg-container'}`}
               >
                  {STATUS[s].dot} {STATUS[s].label} <b className="tabular-nums">{total(s)}</b>
               </button>
            ))}
         </div>
         <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {byProductOrder(Object.entries(counts)).map(([p, c]) => (
               <button
                  key={p}
                  type="button"
                  onClick={() => setProduct(product === p ? '' : p)}
                  className={`rounded-xl border p-3 text-left ${product === p ? 'border-primary bg-primary/5' : 'bg-container'}`}
               >
                  <div className="text-sm font-medium">{productName(p)}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs tabular-nums text-muted-foreground">
                     {ORDER.filter((s) => c[s]).map((s) => (
                        <span key={s}>
                           {STATUS[s].dot} {c[s]}
                        </span>
                     ))}
                     {c['silent-risk'] ? <span>· {c['silent-risk']} silent-risk</span> : null}
                  </div>
               </button>
            ))}
         </div>

         {/* view switch + filters */}
         <div className="flex flex-wrap items-center gap-2">
            {(
               [
                  ['all', 'All automations'],
                  ['away', 'While you were away'],
                  ['risks', 'Risks'],
               ] as const
            ).map(([v, label]) => (
               <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`min-h-9 rounded-full px-3 text-sm ${view === v ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground'}`}
               >
                  {label}
               </button>
            ))}
            {view === 'all' && (
               <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:ml-auto">
                  <label className="flex min-h-9 items-center gap-1.5">
                     <input
                        type="checkbox"
                        checked={customerOnly}
                        onChange={(e) => setCustomerOnly(e.target.checked)}
                     />
                     Customer-facing
                  </label>
                  <label className="flex min-h-9 items-center gap-1.5">
                     <input
                        type="checkbox"
                        checked={moneyOnly}
                        onChange={(e) => setMoneyOnly(e.target.checked)}
                     />
                     Zoho / payments
                  </label>
                  {(product || status || customerOnly || moneyOnly) && (
                     <button
                        type="button"
                        className="min-h-9 underline"
                        onClick={() => {
                           setProduct('');
                           setStatus('');
                           setCustomerOnly(false);
                           setMoneyOnly(false);
                        }}
                     >
                        Clear filters
                     </button>
                  )}
               </div>
            )}
         </div>

         {view === 'all' && (
            <div className="space-y-6">
               {!loading && shown.length === 0 && (
                  <EmptyState title="Nothing matches these filters." />
               )}
               {[...grouped.entries()].map(([p, cats]) => (
                  <section key={p} className="space-y-3">
                     <h2 className="text-base font-semibold">{productName(p)}</h2>
                     {[...cats.entries()].map(([cat, list]) => (
                        <div key={cat} className="overflow-hidden rounded-xl border bg-container">
                           <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {cat} · {list.length}
                           </div>
                           <div className="hidden grid-cols-[2rem_minmax(0,2.4fr)_minmax(0,1.3fr)_5rem_minmax(0,1fr)_7rem_7rem] gap-3 border-b px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground lg:grid">
                              <span />
                              <span>What it does</span>
                              <span>Trigger · frequency</span>
                              <span>Customers</span>
                              <span>Zoho / pay · where</span>
                              <span>Last run</span>
                              <span>Next due</span>
                           </div>
                           <ul className="divide-y">
                              {list.map((r) => (
                                 <AutomationRow
                                    key={r.id}
                                    row={r}
                                    open={open === r.id}
                                    onToggle={() => setOpen(open === r.id ? null : r.id)}
                                    onSaved={load}
                                 />
                              ))}
                           </ul>
                        </div>
                     ))}
                  </section>
               ))}
            </div>
         )}
         {view === 'away' && <AwayView />}
         {view === 'risks' && <RisksView />}

         {meta && <Footer meta={meta} onSent={load} />}
      </div>
   );
}

function AutomationRow({
   row: r,
   open,
   onToggle,
   onSaved,
}: {
   row: Row;
   open: boolean;
   onToggle: () => void;
   onSaved: () => void;
}) {
   const s = STATUS[r.status];
   return (
      <li>
         <button
            type="button"
            onClick={onToggle}
            className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-muted/30 lg:grid-cols-[2rem_minmax(0,2.4fr)_minmax(0,1.3fr)_5rem_minmax(0,1fr)_7rem_7rem] lg:gap-3"
         >
            <span title={`${s.label}: ${r.reason}`} className="pt-0.5">
               {s.dot}
            </span>
            <span className="min-w-0">
               <span className="flex items-center gap-1 font-medium [overflow-wrap:anywhere]">
                  {open ? (
                     <ChevronDown className="size-3.5 shrink-0" />
                  ) : (
                     <ChevronRight className="size-3.5 shrink-0" />
                  )}
                  {r.name}
               </span>
               <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {r.what}
               </span>
               <span className={`block text-[11px] ${s.cls}`}>{r.reason}</span>
            </span>
            <span className="col-start-2 text-xs text-muted-foreground [overflow-wrap:anywhere] lg:col-start-auto">
               {r.trigger_text}
            </span>
            <span className="col-start-2 text-xs lg:col-start-auto">
               {r.customer === 'yes' ? 'Yes' : r.customer === 'group' ? 'Group' : 'No'}
            </span>
            <span className="col-start-2 text-xs text-muted-foreground [overflow-wrap:anywhere] lg:col-start-auto">
               {r.money && <span className="text-foreground">{r.money} · </span>}
               {r.n8n_ids.length ? `n8n ${r.n8n_ids.join(', ')}` : r.where_text}
            </span>
            <span className="col-start-2 text-xs tabular-nums lg:col-start-auto">
               <span className="text-muted-foreground lg:hidden">Last run </span>
               {ist(r.last_run)}
            </span>
            <span className="col-start-2 text-xs tabular-nums lg:col-start-auto">
               <span className="text-muted-foreground lg:hidden">Next due </span>
               {ist(r.next_due)}
            </span>
         </button>
         {open && <RowDetail row={r} onSaved={onSaved} />}
      </li>
   );
}

interface Run {
   source: string;
   started_at: string;
   status: string;
   workflow_id: string | null;
   error_text: string;
   link: string | null;
}

function RowDetail({ row: r, onSaved }: { row: Row; onSaved: () => void }) {
   const [runs, setRuns] = useState<Run[] | null>(null);
   const [edit, setEdit] = useState(false);
   useEffect(() => {
      fetch(`/api/ops/automations/${encodeURIComponent(r.id)}/runs?days=7`, { cache: 'no-store' })
         .then((x) => (x.ok ? x.json() : null))
         .then((d) => setRuns(d?.runs ?? []))
         .catch(() => setRuns([]));
   }, [r.id]);
   return (
      <div className="space-y-3 border-t bg-muted/10 px-3 py-3 text-xs">
         <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            <span>Last success {ist(r.last_success)}</span>
            <span>
               7 days: {r.runs_ok_7d} ok · {r.runs_err_7d} errors · {r.missed_7d} missed
            </span>
            {r.watched_by && <span>Watched by: {r.watched_by}</span>}
            {r.owner && <span>Owner: {r.owner}</span>}
            {r.feed && <span>Feed: {r.feed}</span>}
            <span>id {r.id}</span>
         </div>
         {r.notes && <p className="[overflow-wrap:anywhere]">{r.notes}</p>}
         <div>
            <p className="mb-1 font-medium">Recent runs</p>
            {runs === null ? (
               <p className="text-muted-foreground">Loading…</p>
            ) : runs.length === 0 ? (
               <p className="text-muted-foreground">No runs recorded in 7 days.</p>
            ) : (
               <ul className="flex flex-wrap gap-1.5">
                  {runs.slice(0, 40).map((x, i) => (
                     <li key={i}>
                        <a
                           href={x.link ?? undefined}
                           target="_blank"
                           rel="noreferrer"
                           title={`${x.status} · ${x.source}${x.error_text ? ' · ' + x.error_text : ''}`}
                           className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${x.status === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : x.status === 'error' || x.status === 'crashed' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-muted text-muted-foreground'}`}
                        >
                           {ist(x.started_at)}
                        </a>
                     </li>
                  ))}
               </ul>
            )}
         </div>
         {edit ? (
            <EditForm row={r} onDone={() => (setEdit(false), onSaved())} />
         ) : (
            <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
               Edit
            </Button>
         )}
      </div>
   );
}

function EditForm({ row: r, onDone }: { row: Row; onDone: () => void }) {
   const [f, setF] = useState({
      name: r.name,
      what: r.what,
      trigger_text: r.trigger_text,
      kind: r.kind,
      cadence_min: r.cadence_min == null ? '' : String(r.cadence_min),
      customer: r.customer,
      money: r.money,
      where_text: r.where_text,
      n8n_ids: r.n8n_ids.join(', '),
      feed: r.feed,
      watched_by: r.watched_by,
      owner: r.owner,
      intended_off: r.intended_off,
      notes: r.notes,
   });
   const input =
      'h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus:border-primary';
   const text = (k: keyof typeof f, label: string) => (
      <label className="space-y-1">
         <span className="text-muted-foreground">{label}</span>
         <input
            className={input}
            value={String(f[k])}
            onChange={(e) => setF({ ...f, [k]: e.target.value })}
         />
      </label>
   );
   return (
      <div className="space-y-2 rounded-lg border bg-background p-3">
         <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {text('name', 'Name')}
            {text('what', 'What it does')}
            {text('trigger_text', 'Trigger / frequency')}
            <label className="space-y-1">
               <span className="text-muted-foreground">Kind · cadence (min)</span>
               <span className="flex gap-2">
                  <select
                     className={input}
                     value={f.kind}
                     onChange={(e) => setF({ ...f, kind: e.target.value })}
                  >
                     <option value="schedule">schedule</option>
                     <option value="event">event</option>
                     <option value="manual">manual</option>
                  </select>
                  <input
                     className={input}
                     inputMode="numeric"
                     value={f.cadence_min}
                     onChange={(e) =>
                        setF({ ...f, cadence_min: e.target.value.replace(/\D/g, '') })
                     }
                  />
               </span>
            </label>
            <label className="space-y-1">
               <span className="text-muted-foreground">Touches customers?</span>
               <select
                  className={input}
                  value={f.customer}
                  onChange={(e) => setF({ ...f, customer: e.target.value as Row['customer'] })}
               >
                  <option value="yes">Yes</option>
                  <option value="group">Group (internal)</option>
                  <option value="no">No</option>
               </select>
            </label>
            {text('money', 'Writes Zoho / payments (blank = no)')}
            {text('n8n_ids', 'n8n workflow ids (comma-separated)')}
            {text('where_text', 'Where it runs')}
            {text('feed', 'Feed (crm:<table> · tracker:latam · coolify:<uuid>)')}
            {text('watched_by', 'How we would know it broke')}
            {text('owner', 'Owner')}
            {text('notes', 'Notes')}
         </div>
         <label className="flex min-h-9 items-center gap-2">
            <input
               type="checkbox"
               checked={f.intended_off}
               onChange={(e) => setF({ ...f, intended_off: e.target.checked })}
            />
            Switched off on purpose (shows ⚪, never alarms)
         </label>
         <div className="flex flex-wrap gap-2">
            <Button
               size="sm"
               onClick={async () => {
                  const d = await send(
                     `/api/ops/automations/${encodeURIComponent(r.id)}`,
                     'PATCH',
                     {
                        ...f,
                        cadence_min: f.cadence_min ? Number(f.cadence_min) : null,
                        n8n_ids: f.n8n_ids
                           .split(/[,\s]+/)
                           .map((x) => x.trim())
                           .filter(Boolean),
                     }
                  );
                  if (d) {
                     toast.success('Saved');
                     onDone();
                  }
               }}
            >
               Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
               Cancel
            </Button>
            <Button
               size="sm"
               variant="ghost"
               className="ml-auto text-red-600"
               onClick={async () => {
                  if (!window.confirm(`Delete "${r.name}" from the registry?`)) return;
                  if (await send(`/api/ops/automations/${encodeURIComponent(r.id)}`, 'DELETE'))
                     onDone();
               }}
            >
               Delete
            </Button>
         </div>
      </div>
   );
}

function AwayView() {
   const [since, setSince] = useState<'24h' | '7d'>('24h');
   const [d, setD] = useState<Away | null>(null);
   useEffect(() => {
      setD(null);
      fetch(`/api/ops/automations/away?since=${since}`, { cache: 'no-store' })
         .then((x) => (x.ok ? x.json() : null))
         .then(setD)
         .catch(() => setD(null));
   }, [since]);
   return (
      <div className="space-y-4">
         <div className="flex gap-2">
            {(['24h', '7d'] as const).map((s) => (
               <button
                  key={s}
                  type="button"
                  onClick={() => setSince(s)}
                  className={`min-h-9 rounded-md border px-3 text-sm ${since === s ? 'border-primary bg-primary/10' : ''}`}
               >
                  {s === '24h' ? 'Since yesterday' : 'Last 7 days'}
               </button>
            ))}
         </div>
         {!d ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
         ) : (
            <>
               <p className="text-sm">
                  Since {ist(d.since)}: <b>{d.totals.runs_ok}</b> successful runs and{' '}
                  <b>{d.totals.runs_err}</b> errors across <b>{d.totals.ran}</b> automations.
               </p>
               <AwayList
                  title={`🔴 Failed (${d.failed.length})`}
                  items={d.failed.map((x) => ({
                     key: x.id,
                     main: `${x.name} · ${productName(x.product)}`,
                     sub: `${x.err} errors, ${x.ok} ok · last error ${ist(x.last_err)}`,
                  }))}
               />
               <AwayList
                  title={`🟡 Missed scheduled runs (${d.missed.length})`}
                  items={d.missed.map((x) => ({
                     key: x.id,
                     main: `${x.name} · ${productName(x.product)}`,
                     sub: `${x.slots.length} missed: ${x.slots.slice(-4).map(ist).join(', ')}`,
                  }))}
               />
               <AwayList
                  title={`Status changes (${d.changes.length})`}
                  items={d.changes.map((c, i) => ({
                     key: `${c.automation_id}-${i}`,
                     main: `${c.name}: ${c.from_status} → ${c.to_status}`,
                     sub: `${ist(c.at)} · ${c.reason}`,
                  }))}
               />
               <AwayList
                  title={`🟢 What ran (${d.ran.length})`}
                  items={d.ran.slice(0, 60).map((x) => ({
                     key: x.id,
                     main: `${x.name} · ${productName(x.product)}`,
                     sub: `${x.ok} ok${x.err ? `, ${x.err} errors` : ''}`,
                  }))}
               />
            </>
         )}
      </div>
   );
}

function AwayList({
   title,
   items,
}: {
   title: string;
   items: { key: string; main: string; sub: string }[];
}) {
   return (
      <section className="rounded-xl border bg-container">
         <h3 className="border-b px-3 py-2 text-sm font-medium">{title}</h3>
         {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">None.</p>
         ) : (
            <ul className="divide-y">
               {items.map((x) => (
                  <li key={x.key} className="px-3 py-2 text-sm">
                     <div className="[overflow-wrap:anywhere]">{x.main}</div>
                     <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {x.sub}
                     </div>
                  </li>
               ))}
            </ul>
         )}
      </section>
   );
}

function RisksView() {
   const [risks, setRisks] = useState<Risk[] | null>(null);
   const load = useCallback(() => {
      fetch('/api/ops/automations/risks', { cache: 'no-store' })
         .then((x) => (x.ok ? x.json() : null))
         .then((d) => setRisks(d?.risks ?? []))
         .catch(() => setRisks([]));
   }, []);
   useEffect(load, [load]);
   if (!risks) return <p className="text-sm text-muted-foreground">Loading…</p>;
   return (
      <div className="space-y-4">
         {['P0', 'P1', 'P2'].map((p) => (
            <section key={p} className="rounded-xl border bg-container">
               <h3 className="border-b px-3 py-2 text-sm font-medium">
                  {p} · {risks.filter((r) => r.priority === p && !r.done_at).length} open
               </h3>
               <ul className="divide-y">
                  {risks
                     .filter((r) => r.priority === p)
                     .map((r) => (
                        <li key={r.id} className="flex gap-3 px-3 py-2.5 text-sm">
                           <input
                              type="checkbox"
                              className="mt-1 size-4 shrink-0"
                              checked={!!r.done_at}
                              aria-label="Fixed"
                              onChange={async (e) => {
                                 if (
                                    await send(`/api/ops/automations/risks/${r.id}`, 'PATCH', {
                                       done: e.target.checked,
                                    })
                                 )
                                    load();
                              }}
                           />
                           <div
                              className={`min-w-0 ${r.done_at ? 'text-muted-foreground line-through' : ''}`}
                           >
                              <div className="[overflow-wrap:anywhere]">{r.risk}</div>
                              <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                 {r.impact} · owner {r.owner}
                                 {r.decision && r.decision !== 'No'
                                    ? ` · decision: ${r.decision}`
                                    : ''}
                                 {r.done_at && ` · fixed ${ist(r.done_at)} by ${r.done_by}`}
                              </div>
                           </div>
                        </li>
                     ))}
               </ul>
            </section>
         ))}
      </div>
   );
}

function Footer({ meta, onSent }: { meta: Meta; onSent: () => void }) {
   const [preview, setPreview] = useState<string | null>(null);
   return (
      <footer className="space-y-2 border-t pt-3 text-xs text-muted-foreground">
         <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
               n8n tz: <b className="text-foreground">{meta.n8n_tz}</b>
            </span>
            <span>
               Last poll:{' '}
               {meta.poll
                  ? `${ist(meta.poll.at)}${meta.poll.ok ? '' : ` — error: ${meta.poll.error}`}${meta.poll.skipped ? ` (${meta.poll.skipped})` : ''}`
                  : 'never'}
            </span>
            <span>History since {ist(meta.history_from)}</span>
            <span>
               Feeds: CRM {meta.feeds.crm ? 'on' : 'off'} · tracker{' '}
               {meta.feeds.tracker ? 'on' : 'off'} · Coolify {meta.feeds.coolify ? 'on' : 'off'}
            </span>
            <span>
               Morning DM 08:30 IST: {meta.dm_configured ? 'on' : 'off (JARVIS_DM_KEY not set)'}
               {meta.summary &&
                  ` · last ${meta.summary.date} ${meta.summary.ok ? 'sent' : `failed: ${meta.summary.error}`}`}
            </span>
         </div>
         <div className="flex flex-wrap gap-2">
            <Button
               size="sm"
               variant="outline"
               onClick={async () => {
                  const d = await send('/api/ops/automations/summary', 'GET');
                  if (d) setPreview(d.text);
               }}
            >
               Preview morning summary
            </Button>
            <Button
               size="sm"
               variant="outline"
               disabled={!meta.dm_configured}
               onClick={async () => {
                  if (!window.confirm('Send the summary to Nissi now (Jarvis bot DM)?')) return;
                  const d = await send('/api/ops/automations/summary/send', 'POST');
                  if (d)
                     toast[d.sent ? 'success' : 'error'](d.sent ? 'Sent' : `Not sent: ${d.reason}`);
                  onSent();
               }}
            >
               <Send className="size-4" /> Send now
            </Button>
         </div>
         {preview && (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs text-foreground">
               {preview}
            </pre>
         )}
      </footer>
   );
}
