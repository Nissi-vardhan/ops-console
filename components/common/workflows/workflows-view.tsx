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
   Globe,
   Code2,
   Split,
   SlidersHorizontal,
   Database,
   Merge,
   Box,
   Sparkles,
   Plus,
   Minus,
   Maximize2,
   type LucideIcon,
} from 'lucide-react';
import { DateRangePicker, type Range } from '@/components/common/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/common/page-header';

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
const NH = 56;
const PAD = 60;
const shortType = (t: string) => t.split('.').pop() || t;

function nodeStyle(type: string): { Icon: LucideIcon; color: string } {
   const t = (type.split('.').pop() || '').toLowerCase();
   const table: [RegExp, LucideIcon, string][] = [
      [/webhook/, Webhook, '#2563eb'],
      [/schedule|cron/, Clock, '#6366f1'],
      [/manual/, MousePointerClick, '#64748b'],
      [/form/, FileInput, '#0ea5e9'],
      [/httprequest|^http/, Globe, '#14b8a6'],
      [/code|function/, Code2, '#f59e0b'],
      [/^if$|filter/, GitBranch, '#a855f7'],
      [/switch/, Split, '#a855f7'],
      [/merge/, Merge, '#10b981'],
      [/set|editfields/, SlidersHorizontal, '#64748b'],
      [/postgres|mysql|database|supabase|redis/, Database, '#3b82f6'],
      [/openai|langchain|agent|lmchat|mcp/, Sparkles, '#8b5cf6'],
      [/gmail|email|send|smtp|twilio/, Mail, '#ef4444'],
      [/errortrigger/, AlertTriangle, '#ef4444'],
      [/noop/, Circle, '#94a3b8'],
   ];
   for (const [re, Icon, color] of table) if (re.test(t)) return { Icon, color };
   return { Icon: Box, color: '#64748b' };
}

function FlowCanvas({ detail }: { detail: Detail }) {
   const wrapRef = useRef<HTMLDivElement>(null);
   const [view, setView] = useState({ z: 1, x: 0, y: 0, fit: 1 });
   const drag = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null);

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
      return { m, minX, minY, w: maxX - minX + NW + PAD * 2, h: maxY - minY + NH + PAD * 2 };
   }, [detail]);

   useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;
      const compute = () => {
         const fit = Math.min(1, (el.clientWidth - 16) / pos.w, (el.clientHeight - 16) / pos.h);
         setView({ z: fit, x: 0, y: 0, fit });
      };
      compute();
      const ro = new ResizeObserver(compute);
      ro.observe(el);
      return () => ro.disconnect();
   }, [pos.w, pos.h]);

   const nx = (name: string) => (pos.m[name]?.x ?? 0) - pos.minX + PAD;
   const ny = (name: string) => (pos.m[name]?.y ?? 0) - pos.minY + PAD;

   const edges: { d: string; key: string }[] = [];
   for (const [src, conn] of Object.entries(detail.connections)) {
      (conn.main ?? []).forEach((targets, gi) =>
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

   const onDown = (e: React.MouseEvent) => {
      drag.current = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y };
   };
   const onMove = (e: React.MouseEvent) => {
      if (!drag.current) return;
      const d = drag.current;
      setView((v) => ({ ...v, x: d.x + (e.clientX - d.sx), y: d.y + (e.clientY - d.sy) }));
   };
   const onUp = () => {
      drag.current = null;
   };
   const zoom = (f: number) => setView((v) => ({ ...v, z: Math.max(0.15, Math.min(2, v.z * f)) }));

   return (
      <div
         ref={wrapRef}
         onMouseDown={onDown}
         onMouseMove={onMove}
         onMouseUp={onUp}
         onMouseLeave={onUp}
         className="relative h-full w-full cursor-grab overflow-hidden rounded-lg border bg-muted/20 active:cursor-grabbing"
      >
         <div
            style={{
               width: pos.w,
               height: pos.h,
               transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
               transformOrigin: 'top left',
            }}
            className="absolute left-0 top-0"
         >
            <svg width={pos.w} height={pos.h} className="pointer-events-none absolute inset-0">
               <defs>
                  <marker
                     id="wf-arrow"
                     markerWidth="8"
                     markerHeight="8"
                     refX="6.5"
                     refY="3"
                     orient="auto"
                  >
                     <path d="M0,0 L7,3 L0,6 Z" fill="var(--muted-foreground)" opacity="0.5" />
                  </marker>
               </defs>
               {edges.map((e) => (
                  <path
                     key={e.key}
                     d={e.d}
                     fill="none"
                     stroke="var(--muted-foreground)"
                     strokeOpacity={0.45}
                     strokeWidth={2}
                     markerEnd="url(#wf-arrow)"
                  />
               ))}
            </svg>
            {detail.nodes.map((n) => {
               const { Icon, color } = nodeStyle(n.type);
               return (
                  <div
                     key={n.name}
                     className={`absolute flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 shadow-sm ${n.disabled ? 'opacity-40' : ''}`}
                     style={{
                        left: nx(n.name),
                        top: ny(n.name),
                        width: NW,
                        height: NH,
                        borderLeft: `3px solid ${color}`,
                     }}
                     title={n.type}
                  >
                     <span
                        className="flex size-6 shrink-0 items-center justify-center rounded-md"
                        style={{ background: `${color}22`, color }}
                     >
                        <Icon className="size-3.5" />
                     </span>
                     <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium leading-tight">
                           {n.name}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                           {shortType(n.type)}
                        </span>
                     </span>
                  </div>
               );
            })}
         </div>

         {/* zoom controls */}
         <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/90 px-1 py-0.5 shadow-sm backdrop-blur">
            <button
               onClick={() => zoom(1 / 1.2)}
               className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
               aria-label="Zoom out"
            >
               <Minus className="size-4" />
            </button>
            <span className="min-w-10 text-center text-xs tabular-nums text-muted-foreground">
               {Math.round(view.z * 100)}%
            </span>
            <button
               onClick={() => zoom(1.2)}
               className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
               aria-label="Zoom in"
            >
               <Plus className="size-4" />
            </button>
            <button
               onClick={() => setView((v) => ({ ...v, z: v.fit, x: 0, y: 0 }))}
               className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
               aria-label="Fit"
            >
               <Maximize2 className="size-3.5" />
            </button>
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
   const [range, setRange] = useState<Range>({});
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
      const from = range.from ? +range.from : null;
      const to = range.to ? +range.to + 864e5 : null; // inclusive end-of-day
      return wfs.filter((w) => {
         if (status === 'active' && !w.active) return false;
         if (status === 'paused' && w.active) return false;
         if (trig !== 'all' && w.trigger !== trig) return false;
         if (from) {
            const t = w.lastRun?.at ? new Date(w.lastRun.at).getTime() : null;
            if (t === null || t < from || (to && t > to)) return false;
         }
         if (s && !`${w.name} ${w.tags.join(' ')}`.toLowerCase().includes(s)) return false;
         return true;
      });
   }, [wfs, q, status, trig, range]);

   const activeCount = wfs.filter((w) => w.active).length;

   return (
      <div className="mx-auto w-full max-w-[1400px] space-y-4 p-4 sm:p-6">
         <PageHeader
            icon={WorkflowIcon}
            title="Workflows"
            subtitle={loading ? 'Loading…' : `${wfs.length} n8n workflows · ${activeCount} active`}
         />

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
            <DateRangePicker value={range} onChange={setRange} className="h-9" />
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
                  {loading &&
                     Array.from({ length: 8 }).map((_, i) => (
                        <tr key={`sk-${i}`} className="border-b border-border/60">
                           <td className="px-4 py-3">
                              <Skeleton className="h-4 w-44" />
                           </td>
                           <td className="px-3 py-3">
                              <Skeleton className="h-4 w-14 rounded-full" />
                           </td>
                           <td className="px-3 py-3">
                              <Skeleton className="h-4 w-16" />
                           </td>
                           <td className="px-3 py-3">
                              <Skeleton className="h-4 w-20" />
                           </td>
                           <td className="px-3 py-3">
                              <Skeleton className="ml-auto h-4 w-6" />
                           </td>
                           <td className="px-3 py-3">
                              <Skeleton className="h-4 w-12" />
                           </td>
                           <td className="px-3 py-3">
                              <Skeleton className="h-4 w-12" />
                           </td>
                           <td className="px-3 py-3">
                              <Skeleton className="size-4" />
                           </td>
                        </tr>
                     ))}
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
