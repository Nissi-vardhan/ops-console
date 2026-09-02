'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
   Server,
   Boxes,
   KeyRound,
   Database,
   Wrench,
   Plus,
   Pencil,
   Trash2,
   RotateCw,
   ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/brand/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { useConfirm } from '@/components/common/confirm';
import { toast } from 'sonner';

interface Svc {
   id: string;
   name: string;
   kind: string;
   url: string | null;
   owner: string | null;
   notes: string;
   expires_at: string | null;
   last_rotated_at: string | null;
}

const KINDS = ['token', 'app', 'server', 'db', 'service'] as const;
const KIND_ICON: Record<string, typeof Server> = {
   token: KeyRound,
   app: Boxes,
   server: Server,
   db: Database,
   service: Wrench,
};
const KIND_LABEL: Record<string, string> = {
   token: 'Tokens & secrets',
   app: 'Apps',
   server: 'Servers',
   db: 'Databases',
   service: 'Services',
};

const today = () => new Date().toISOString().slice(0, 10);
function daysUntil(d: string | null): number | null {
   if (!d) return null;
   return Math.round(
      (new Date(d + 'T00:00:00').getTime() - new Date(today() + 'T00:00:00').getTime()) / 86400000
   );
}
function due(d: string | null): { text: string; cls: string } | null {
   const n = daysUntil(d);
   if (n === null) return null;
   if (n < 0) return { text: `overdue ${-n}d`, cls: 'text-red-500' };
   if (n <= 14) return { text: `rotate in ${n}d`, cls: 'text-amber-500' };
   return { text: `${n}d left`, cls: 'text-muted-foreground' };
}

export function InfraView() {
   const confirm = useConfirm();
   const [svcs, setSvcs] = useState<Svc[]>([]);
   const [loading, setLoading] = useState(true);
   const [editing, setEditing] = useState<Svc | 'new' | null>(null);

   const load = useCallback(async () => {
      const d = await fetch('/api/ops/services', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      setSvcs(d?.services ?? []);
      setLoading(false);
   }, []);
   useEffect(() => {
      load();
   }, [load]);

   const summary = useMemo(() => {
      const withDate = svcs.filter((s) => s.expires_at);
      const overdue = withDate.filter((s) => (daysUntil(s.expires_at) ?? 99) < 0).length;
      const soon = withDate.filter((s) => {
         const n = daysUntil(s.expires_at);
         return n !== null && n >= 0 && n <= 14;
      }).length;
      return { total: svcs.length, overdue, soon };
   }, [svcs]);

   const grouped = useMemo(() => {
      const g: Record<string, Svc[]> = {};
      for (const s of svcs) (g[s.kind] ??= []).push(s);
      return [
         ...KINDS.filter((k) => g[k]?.length),
         ...Object.keys(g).filter((k) => !KINDS.includes(k as (typeof KINDS)[number])),
      ].map((k) => [k, g[k]] as [string, Svc[]]);
   }, [svcs]);

   const save = async (body: Partial<Svc>, id?: string) => {
      const r = await fetch(id ? `/api/ops/services/${id}` : '/api/ops/services', {
         method: id ? 'PATCH' : 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
      });
      if (r.ok) {
         setEditing(null);
         load();
      } else {
         const j = await r.json().catch(() => ({}));
         toast.error(j.error || 'Failed to save');
      }
   };
   const rotated = (s: Svc) =>
      save(
         {
            last_rotated_at: today(),
            expires_at: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
         },
         s.id
      );
   const del = async (s: Svc) => {
      if (await confirm({ title: `Remove ${s.name}?`, danger: true, confirmText: 'Remove' })) {
         await fetch(`/api/ops/services/${s.id}`, { method: 'DELETE' });
         load();
      }
   };

   if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading infra…</p>;

   return (
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
         <PageHeader
            icon={Server}
            title="Infra & tokens"
            subtitle={
               <>
                  {summary.total} tracked
                  {summary.overdue > 0 && (
                     <span className="text-red-500"> · {summary.overdue} overdue</span>
                  )}
                  {summary.soon > 0 && (
                     <span className="text-amber-500"> · {summary.soon} due soon</span>
                  )}
               </>
            }
            actions={
               <Button size="sm" onClick={() => setEditing('new')}>
                  <Plus className="mr-1 size-4" /> Add
               </Button>
            }
         />

         {grouped.map(([kind, list]) => {
            const Icon = KIND_ICON[kind] ?? Wrench;
            return (
               <div key={kind} className="overflow-hidden rounded-xl border bg-container">
                  <div className="flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                     <Icon className="size-3.5" /> {KIND_LABEL[kind] ?? kind}
                  </div>
                  {list.map((s) => {
                     const d = due(s.expires_at);
                     return (
                        <div
                           key={s.id}
                           className="group flex items-center gap-3 border-b px-4 py-2.5 last:border-0 hover:bg-muted/30"
                        >
                           <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                 <span className="truncate text-sm font-medium">{s.name}</span>
                                 {s.url && (
                                    <a
                                       href={s.url}
                                       target="_blank"
                                       rel="noreferrer"
                                       className="text-muted-foreground hover:text-foreground"
                                    >
                                       <ExternalLink className="size-3.5" />
                                    </a>
                                 )}
                              </div>
                              {(s.owner || s.notes) && (
                                 <p className="truncate text-[11px] text-muted-foreground">
                                    {[s.owner, s.notes].filter(Boolean).join(' · ')}
                                 </p>
                              )}
                           </div>
                           {d && (
                              <span className={`shrink-0 text-xs font-medium ${d.cls}`}>
                                 {d.text}
                              </span>
                           )}
                           <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              {s.kind === 'token' && (
                                 <button
                                    title="Mark rotated (+90d)"
                                    onClick={() => rotated(s)}
                                    className="text-muted-foreground hover:text-emerald-500"
                                 >
                                    <RotateCw className="size-4" />
                                 </button>
                              )}
                              <button
                                 onClick={() => setEditing(s)}
                                 className="text-muted-foreground hover:text-foreground"
                              >
                                 <Pencil className="size-4" />
                              </button>
                              <button
                                 onClick={() => del(s)}
                                 className="text-muted-foreground hover:text-red-500"
                              >
                                 <Trash2 className="size-4" />
                              </button>
                           </div>
                        </div>
                     );
                  })}
               </div>
            );
         })}
         {svcs.length === 0 && (
            <div className="rounded-xl border bg-container">
               <EmptyState
                  title="Nothing tracked yet."
                  hint="Add servers, apps, and tokens (with rotation dates) to keep an eye on them."
               />
            </div>
         )}

         {editing && (
            <SvcModal
               svc={editing === 'new' ? null : editing}
               onClose={() => setEditing(null)}
               onSave={save}
            />
         )}
      </div>
   );
}

function SvcModal({
   svc,
   onClose,
   onSave,
}: {
   svc: Svc | null;
   onClose: () => void;
   onSave: (b: Partial<Svc>, id?: string) => void;
}) {
   const [f, setF] = useState<Partial<Svc>>(svc ?? { kind: 'token', notes: '' });
   const set = (k: keyof Svc, v: string) => setF({ ...f, [k]: v });
   return (
      <div
         className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
         onClick={onClose}
      >
         <div
            className="w-full max-w-md rounded-xl border bg-container p-5"
            onClick={(e) => e.stopPropagation()}
         >
            <p className="mb-3 text-sm font-semibold">{svc ? 'Edit' : 'Add'} infra item</p>
            <div className="space-y-2.5">
               <input
                  value={f.name ?? ''}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Name (e.g. Coolify API token)"
                  autoFocus
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
               />
               <div className="flex gap-2">
                  <select
                     value={f.kind ?? 'token'}
                     onChange={(e) => set('kind', e.target.value)}
                     className="rounded-md border bg-background px-2 py-2 text-sm"
                  >
                     {KINDS.map((k) => (
                        <option key={k} value={k}>
                           {k}
                        </option>
                     ))}
                  </select>
                  <input
                     value={f.owner ?? ''}
                     onChange={(e) => set('owner', e.target.value)}
                     placeholder="Owner / location"
                     className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
               </div>
               <input
                  value={f.url ?? ''}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="URL (optional)"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
               />
               <div className="flex gap-2">
                  <label className="flex-1 text-[11px] text-muted-foreground">
                     Rotate/renew by
                     <input
                        type="date"
                        value={f.expires_at ?? ''}
                        onChange={(e) => set('expires_at', e.target.value)}
                        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                     />
                  </label>
                  <label className="flex-1 text-[11px] text-muted-foreground">
                     Last rotated
                     <input
                        type="date"
                        value={f.last_rotated_at ?? ''}
                        onChange={(e) => set('last_rotated_at', e.target.value)}
                        className="mt-0.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                     />
                  </label>
               </div>
               <textarea
                  value={f.notes ?? ''}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Notes (where it lives, what it's for)"
                  className="min-h-[60px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
               />
            </div>
            <div className="mt-4 flex justify-end gap-2">
               <Button size="sm" variant="ghost" onClick={onClose}>
                  Cancel
               </Button>
               <Button size="sm" disabled={!f.name?.trim()} onClick={() => onSave(f, svc?.id)}>
                  Save
               </Button>
            </div>
         </div>
      </div>
   );
}
