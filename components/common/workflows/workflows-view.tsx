'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
   Search,
   ExternalLink,
   Workflow as WorkflowIcon,
   X,
   Webhook,
   Clock,
   MousePointerClick,
   FileInput,
   Mail,
   Cpu,
   GitBranch,
   AlertTriangle,
   Circle,
} from 'lucide-react';

interface WF {
   id: string;
   name: string;
   active: boolean;
   trigger: string;
   tags: string[];
   nodeCount: number;
   createdAt: string | null;
   updatedAt: string | null;
   lastRun: { at: string; status: string } | null;
}

const TRIGGER_ICON: Record<string, typeof Webhook> = {
   Webhook,
   'Schedule': Clock,
   'Manual': MousePointerClick,
   'Form': FileInput,
   'Email': Mail,
   'MCP': Cpu,
   'Sub-workflow': GitBranch,
   'Error': AlertTriangle,
};

function rel(iso: string | null): string {
   if (!iso) return '—';
   const ms = Date.now() - new Date(iso).getTime();
   const m = Math.floor(ms / 60000);
   if (m < 1) return 'just now';
   if (m < 60) return `${m}m ago`;
   const h = Math.floor(m / 60);
   if (h < 24) return `${h}h ago`;
   const d = Math.floor(h / 24);
   if (d < 30) return `${d}d ago`;
   try {
      return new Date(iso).toLocaleDateString(undefined, {
         day: 'numeric',
         month: 'short',
         year: 'numeric',
      });
   } catch {
      return iso.slice(0, 10);
   }
}

const runColor = (s?: string) =>
   s === 'success'
      ? 'text-emerald-500'
      : s === 'error' || s === 'crashed'
        ? 'text-red-500'
        : s === 'running' || s === 'waiting'
          ? 'text-amber-500'
          : 'text-muted-foreground';

/* --------------------------- read-only flow canvas -------------------------- */

interface Detail {
   id: string;
   name: string;
   active: boolean;
   tags: string[];
   nodes: { name: string; type: string; position: [number, number]; disabled?: boolean }[];
   connections: Record<string, { main?: { node: string }[][] }>;
}

const NW = 190;
const NH = 54;
const PAD = 50;
const shortType = (t: string) => t.split('.').pop() || t;
const isTrigger = (t: string) =>
   /trigger/i.test(t) || t.endsWith('.webhook') || t.endsWith('.cron');

function FlowCanvas({ detail }: { detail: Detail }) {
   const wrapRef = useRef<HTMLDivElement>(null);
   const [scale, setScale] = useState(1);

   const pos = useMemo(() => {
      const m: Record<string, { x: number; y: number }> = {};
      let minX = Infinity,
         minY = Infinity,
         maxX = -Infinity,
         maxY = -Infinity;
      for (const n of detail.nodes) {
         const [x, y] = n.position;
         m[n.name] = { x, y };
         minX = Math.min(minX, x);
         minY = Math.min(minY, y);
         maxX = Math.max(maxX, x);
         maxY = Math.max(maxY, y);
      }
      if (!detail.nodes.length) {
         minX = minY = 0;
         maxX = maxY = 100;
      }
      const w = maxX - minX + NW + PAD * 2;
      const h = maxY - minY + NH + PAD * 2;
      return { m, minX, minY, w, h };
   }, [detail]);

   useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;
      const fit = () => setScale(Math.min(1, (el.clientWidth - 8) / pos.w));
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      return () => ro.disconnect();
   }, [pos.w]);

   const nx = (name: string) => (pos.m[name]?.x ?? 0) - pos.minX + PAD;
   const ny = (name: string) => (pos.m[name]?.y ?? 0) - pos.minY + PAD;

   const edges: { d: string; key: string }[] = [];
   for (const [src, conn] of Object.entries(detail.connections)) {
      const groups = conn.main ?? [];
      groups.forEach((targets, gi) =>
         (targets ?? []).forEach((t, ti) => {
            if (!pos.m[src] || !pos.m[t.node]) return;
            const x1 = nx(src) + NW;
            const y1 = ny(src) + NH / 2;
            const x2 = nx(t.node);
            const y2 = ny(t.node) + NH / 2;
            const dx = Math.max(40, Math.abs(x2 - x1) / 2);
            edges.push({
               key: `${src}-${gi}-${ti}-${t.node}`,
               d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
            });
         })
      );
   }

   return (
      <div ref={wrapRef} className="relative w-full overflow-auto rounded-lg border bg-muted/20">
         <div style={{ width: pos.w * scale, height: pos.h * scale }} className="relative">
            <div
               style={{
                  width: pos.w,
                  height: pos.h,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
               }}
               className="absolute left-0 top-0"
            >
               <svg width={pos.w} height={pos.h} className="pointer-events-none absolute inset-0">
                  {edges.map((e) => (
                     <path key={e.key} d={e.d} fill="none" stroke="var(--border)" strokeWidth={2} />
                  ))}
               </svg>
               {detail.nodes.map((n) => (
                  <div
                     key={n.name}
                     className={`absolute flex flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 py-2 shadow-sm ${
                        isTrigger(n.type) ? 'border-l-[3px] border-l-primary' : ''
                     } ${n.disabled ? 'opacity-40' : ''}`}
                     style={{ left: nx(n.name), top: ny(n.name), width: NW, height: NH }}
                     title={n.type}
                  >
                     <span className="truncate text-[12px] font-medium leading-tight">
                        {n.name}
                     </span>
                     <span className="truncate text-[10px] text-muted-foreground">
                        {shortType(n.type)}
                     </span>
                  </div>
               ))}
            </div>
         </div>
      </div>
   );
}

/* --------------------------------- view ------------------------------------ */

export function WorkflowsView() {
   const [wfs, setWfs] = useState<WF[]>([]);
   const [base, setBase] = useState('https://n8n.shortcastle.com');
   const [configured, setConfigured] = useState(true);
   const [loading, setLoading] = useState(true);
   const [q, setQ] = useState('');
   const [status, setStatus] = useState<'all' | 'active' | 'paused'>('all');
   const [trig, setTrig] = useState('all');
   const [openId, setOpenId] = useState<string | null>(null);
   const [detail, setDetail] = useState<Detail | null>(null);
   const [detailLoading, setDetailLoading] = useState(false);

   useEffect(() => {
      fetch('/api/ops/workflows', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!d) return;
            setConfigured(!!d.configured);
            setBase(d.base || base);
            setWfs(d.workflows || []);
         })
         .catch(() => {})
         .finally(() => setLoading(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   const openDetail = useCallback((id: string) => {
      setOpenId(id);
      setDetail(null);
      setDetailLoading(true);
      fetch(`/api/ops/workflows/${id}`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setDetail(d?.workflow ?? null))
         .catch(() => {})
         .finally(() => setDetailLoading(false));
   }, []);

   const triggers = useMemo(
      () => Array.from(new Set(wfs.map((w) => w.trigger).filter((t) => t && t !== '—'))).sort(),
      [wfs]
   );
   const rows = useMemo(() => {
      const s = q.trim().toLowerCase();
      return wfs.filter((w) => {
         if (status === 'active' && !w.active) return false;
         if (status === 'paused' && w.active) return false;
         if (trig !== 'all' && w.trigger !== trig) return false;
         if (s && !`${w.name} ${w.tags.join(' ')}`.toLowerCase().includes(s)) return false;
         return true;
      });
   }, [wfs, q, status, trig]);

   const activeCount = wfs.filter((w) => w.active).length;

   return (
      <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 sm:p-6">
         <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
               <h1 className="flex items-center gap-2 text-lg font-semibold">
                  <WorkflowIcon className="size-5 text-primary" /> Workflows
               </h1>
               <p className="text-sm text-muted-foreground">
                  {loading ? 'Loading…' : `${wfs.length} n8n workflows · ${activeCount} active`}
               </p>
            </div>
         </div>

         {!configured && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
               n8n isn’t configured (set N8N_BASE_URL + N8N_API_KEY).
            </p>
         )}

         {/* controls */}
         <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
               <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
               <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search workflows…"
                  className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary"
               />
            </div>
            <select
               value={status}
               onChange={(e) => setStatus(e.target.value as typeof status)}
               className="h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-primary"
            >
               <option value="all">All status</option>
               <option value="active">Active</option>
               <option value="paused">Paused</option>
            </select>
            <select
               value={trig}
               onChange={(e) => setTrig(e.target.value)}
               className="h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-primary"
            >
               <option value="all">All triggers</option>
               {triggers.map((t) => (
                  <option key={t} value={t}>
                     {t}
                  </option>
               ))}
            </select>
         </div>

         {/* table */}
         <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[820px] text-sm">
               <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                     <th className="px-4 py-2.5 font-medium">Workflow</th>
                     <th className="px-3 py-2.5 font-medium">Status</th>
                     <th className="px-3 py-2.5 font-medium">Trigger</th>
                     <th className="px-3 py-2.5 font-medium">Tags</th>
                     <th className="px-3 py-2.5 text-right font-medium">Nodes</th>
                     <th className="px-3 py-2.5 font-medium">Last run</th>
                     <th className="px-3 py-2.5 font-medium">Updated</th>
                     <th className="px-3 py-2.5 font-medium"></th>
                  </tr>
               </thead>
               <tbody>
                  {rows.map((w) => {
                     const TI = TRIGGER_ICON[w.trigger] ?? Circle;
                     return (
                        <tr
                           key={w.id}
                           onClick={() => openDetail(w.id)}
                           className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                        >
                           <td className="max-w-[320px] px-4 py-2.5">
                              <span className="flex items-center gap-2">
                                 <span
                                    className={`size-2 shrink-0 rounded-full ${w.active ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                                 />
                                 <span className="truncate font-medium">{w.name}</span>
                              </span>
                           </td>
                           <td className="px-3 py-2.5">
                              <span
                                 className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    w.active
                                       ? 'bg-emerald-500/12 text-emerald-500'
                                       : 'bg-muted text-muted-foreground'
                                 }`}
                              >
                                 {w.active ? 'Active' : 'Paused'}
                              </span>
                           </td>
                           <td className="px-3 py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                 <TI className="size-3.5" /> {w.trigger}
                              </span>
                           </td>
                           <td className="max-w-[200px] px-3 py-2.5">
                              <span className="flex flex-wrap gap-1">
                                 {w.tags.slice(0, 2).map((t) => (
                                    <span
                                       key={t}
                                       className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                    >
                                       {t}
                                    </span>
                                 ))}
                                 {w.tags.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground">
                                       +{w.tags.length - 2}
                                    </span>
                                 )}
                              </span>
                           </td>
                           <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                              {w.nodeCount}
                           </td>
                           <td className={`px-3 py-2.5 text-xs ${runColor(w.lastRun?.status)}`}>
                              {w.lastRun ? rel(w.lastRun.at) : '—'}
                           </td>
                           <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {rel(w.updatedAt)}
                           </td>
                           <td className="px-3 py-2.5">
                              <a
                                 href={`${base}/workflow/${w.id}`}
                                 target="_blank"
                                 rel="noreferrer"
                                 onClick={(e) => e.stopPropagation()}
                                 title="Open in n8n"
                                 className="inline-flex text-muted-foreground hover:text-foreground"
                              >
                                 <ExternalLink className="size-4" />
                              </a>
                           </td>
                        </tr>
                     );
                  })}
                  {!loading && rows.length === 0 && (
                     <tr>
                        <td
                           colSpan={8}
                           className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                           No workflows match.
                        </td>
                     </tr>
                  )}
               </tbody>
            </table>
         </div>

         {/* detail modal */}
         {openId && (
            <div
               className="fixed inset-0 z-50 flex flex-col bg-black/70 p-2 sm:p-4"
               onClick={() => setOpenId(null)}
            >
               <div
                  className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
                  onClick={(e) => e.stopPropagation()}
               >
                  <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                     <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                           {detail?.name ?? 'Workflow'}
                        </p>
                        {detail && (
                           <p className="text-[11px] text-muted-foreground">
                              {detail.active ? 'Active' : 'Paused'} · {detail.nodes.length} nodes
                              {detail.tags.length ? ` · ${detail.tags.join(', ')}` : ''}
                           </p>
                        )}
                     </div>
                     <div className="flex shrink-0 items-center gap-3">
                        <a
                           href={`${base}/workflow/${openId}`}
                           target="_blank"
                           rel="noreferrer"
                           className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                           <ExternalLink className="size-3.5" /> Open in n8n
                        </a>
                        <button
                           type="button"
                           onClick={() => setOpenId(null)}
                           aria-label="Close"
                           className="text-muted-foreground hover:text-foreground"
                        >
                           <X className="size-5" />
                        </button>
                     </div>
                  </div>
                  <div className="flex-1 overflow-hidden p-3">
                     {detailLoading && (
                        <p className="p-6 text-sm text-muted-foreground">Loading flow…</p>
                     )}
                     {detail && <FlowCanvas detail={detail} />}
                     {!detailLoading && !detail && (
                        <p className="p-6 text-sm text-muted-foreground">
                           Couldn’t load this workflow.
                        </p>
                     )}
                  </div>
               </div>
            </div>
         )}
      </div>
   );
}
