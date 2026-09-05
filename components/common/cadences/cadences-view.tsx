'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/brand/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { useConfirm } from '@/components/common/confirm';
import { useEscape } from '@/components/common/use-escape';
import { Stagger, Item } from '@/components/motion';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
   Mail,
   MessageCircle,
   Plus,
   Pencil,
   Trash2,
   Radio,
   AlertTriangle,
   Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIssuesStore } from '@/store/issues-store';
import {
   useActiveWorkspaceStore,
   inActiveWorkspace,
   ALL_WORKSPACES,
} from '@/store/active-workspace-store';

interface Touch {
   n: number;
   channel: string; // email | whatsapp
   label: string;
   timing: string;
   status: string; // planned | sent | skipped
   sent: number | null;
}
interface Cadence {
   id: string;
   name: string;
   audience: string;
   channels: string;
   status: string;
   issue_id: string | null;
   touches: Touch[];
   blockers: string[];
   notes: string;
   workspace?: string | null;
   updated_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
   draft: { label: 'Draft', cls: 'bg-muted/60 text-muted-foreground' },
   live: { label: 'Live', cls: 'bg-emerald-500/15 text-emerald-500' },
   paused: { label: 'Paused', cls: 'bg-amber-500/15 text-amber-500' },
   blocked: { label: 'Blocked', cls: 'bg-red-500/15 text-red-500' },
   done: { label: 'Done', cls: 'bg-primary/15 text-primary' },
   closed: { label: 'Closed manually', cls: 'bg-muted/60 text-foreground/70' },
};
const STATUSES = Object.keys(STATUS_META);

const ChannelIcon = ({ channel, className }: { channel: string; className?: string }) =>
   channel === 'whatsapp' ? (
      <MessageCircle className={className} />
   ) : (
      <Mail className={className} />
   );

const emptyDraft = () => ({
   name: '',
   audience: '',
   channels: 'email,whatsapp',
   status: 'draft',
   issue_id: '',
   touches: [] as Touch[],
   blockers: '',
   notes: '',
});

// ---- feed (real Zoho cadences pushed via /api/cadences-sync) ----
interface FeedStep {
   n: number;
   channel: string;
   day: number;
   label: string;
}
interface FeedCadence {
   slug: string;
   name: string;
   audience: number;
   status: string;
   channels: string[];
   steps: FeedStep[];
}

// unified display shape for both table + feed cadences
interface UStep {
   n: number;
   channel: string;
   label: string;
   timing: string;
   done: boolean;
   skipped: boolean;
   sent: number | null;
}
interface UCadence {
   key: string;
   editId?: string;
   name: string;
   status: string;
   audienceText: string;
   chans: string[];
   linkIdentifier?: string;
   steps: UStep[];
   blockers: string[];
   notes: string;
   source: 'db' | 'feed';
}

function StepTimeline({ steps, closedNote }: { steps: UStep[]; closedNote?: string }) {
   if (steps.length === 0) {
      return (
         <p className="text-xs text-muted-foreground">
            {closedNote ?? 'No steps yet — add the sequence.'}
         </p>
      );
   }
   return (
      <div className="flex flex-wrap items-stretch gap-2">
         {steps.map((t, i) => (
            <div
               key={i}
               className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${t.done ? 'border-emerald-500/40 bg-emerald-500/5' : ''} ${t.skipped ? 'opacity-50' : ''}`}
            >
               <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${t.done ? 'bg-emerald-500/20 text-emerald-500' : 'border text-muted-foreground'}`}
               >
                  {t.n}
               </span>
               <ChannelIcon
                  channel={t.channel}
                  className={`size-3.5 shrink-0 ${t.done ? 'text-emerald-500' : 'text-muted-foreground'}`}
               />
               <div className="leading-tight">
                  <div className={`text-xs ${t.skipped ? 'line-through' : ''}`}>
                     {t.label || '(step)'}
                  </div>
                  {(t.timing || t.done) && (
                     <div className="text-[10px] text-muted-foreground">
                        {t.timing}
                        {t.done
                           ? t.sent != null
                              ? `${t.timing ? ' · ' : ''}sent ${t.sent}`
                              : `${t.timing ? ' · ' : ''}sent`
                           : ''}
                     </div>
                  )}
               </div>
            </div>
         ))}
      </div>
   );
}

export function CadencesView() {
   const confirm = useConfirm();
   const [cadences, setCadences] = useState<Cadence[]>([]);
   const [feed, setFeed] = useState<FeedCadence[]>([]);
   const [loading, setLoading] = useState(true);
   const [editing, setEditing] = useState<null | 'new' | string>(null);
   const issues = useIssuesStore((s) => s.issues);
   const activeWorkspace = useActiveWorkspaceStore((s) => s.active);
   const { orgId } = useParams<{ orgId: string }>();

   const load = useCallback(async () => {
      const [t, f] = await Promise.all([
         fetch('/api/ops/cadences', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
         fetch('/api/ops/cadences-feed', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
      ]);
      setCadences((t?.cadences ?? []) as Cadence[]);
      setFeed((f?.feed?.cadences ?? []) as FeedCadence[]);
      setLoading(false);
   }, []);
   useEffect(() => {
      load();
   }, [load]);

   const issueOf = (id: string | null) => (id ? issues.find((i) => i.id === id) : undefined);

   // feed cadences (the real active sequences) first, then the UI-authored rows
   const list: UCadence[] = useMemo(() => {
      const fromFeed = (f: FeedCadence): UCadence => ({
         key: `feed:${f.slug}`,
         name: f.name,
         status: f.status,
         audienceText: f.audience ? `${f.audience.toLocaleString()} contacts` : '',
         chans: f.channels,
         steps: f.steps
            .slice()
            .sort((a, b) => a.n - b.n)
            .map((s) => ({
               n: s.n,
               channel: s.channel,
               label: s.label,
               timing: `Day ${s.day}`,
               done: false,
               skipped: false,
               sent: null,
            })),
         blockers: [],
         notes: '',
         source: 'feed',
      });
      const fromDb = (c: Cadence): UCadence => ({
         key: `db:${c.id}`,
         editId: c.id,
         name: c.name,
         status: c.status,
         audienceText: c.audience,
         chans: c.channels
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
         linkIdentifier: issueOf(c.issue_id)?.identifier,
         steps: c.touches
            .slice()
            .sort((a, b) => a.n - b.n)
            .map((t) => ({
               n: t.n,
               channel: t.channel,
               label: t.label,
               timing: t.timing,
               done: t.status === 'sent',
               skipped: t.status === 'skipped',
               sent: t.sent,
            })),
         blockers: c.blockers,
         notes: c.notes,
         source: 'db',
      });
      // Scope to the active workspace: DB cadences by their workspace tag; feed
      // cadences carry no workspace, so they show only under "All workspaces".
      const scopedFeed = activeWorkspace === ALL_WORKSPACES ? feed : [];
      const scopedDb = cadences.filter((c) => inActiveWorkspace(c.workspace, activeWorkspace));
      return [...scopedFeed.map(fromFeed), ...scopedDb.map(fromDb)];
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [feed, cadences, issues, activeWorkspace]);

   const totals = useMemo(
      () => ({
         total: list.length,
         live: list.filter((c) => c.status === 'live').length,
         blocked: list.filter((c) => c.status === 'blocked' || c.blockers.length > 0).length,
      }),
      [list]
   );

   return (
      <div className="w-full space-y-5 p-4 sm:p-6">
         <PageHeader
            icon={Radio}
            title="Cadences"
            subtitle="Multi-touch email + WhatsApp sequences, tracked as first-class flows."
            actions={
               <Button size="sm" onClick={() => setEditing('new')}>
                  <Plus className="mr-1 size-4" /> New cadence
               </Button>
            }
         />

         <div className="grid grid-cols-3 gap-3 sm:max-w-md">
            {[
               { label: 'Cadences', value: totals.total, tint: 'text-foreground' },
               { label: 'Live', value: totals.live, tint: 'text-emerald-500' },
               { label: 'Blocked', value: totals.blocked, tint: 'text-red-500' },
            ].map((s) => (
               <div key={s.label} className="rounded-xl border bg-container p-3">
                  <div className={`text-2xl font-semibold tabular-nums ${s.tint}`}>{s.value}</div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                     {s.label}
                  </div>
               </div>
            ))}
         </div>

         {!loading && list.length === 0 && (
            <div className="rounded-xl border bg-container">
               <EmptyState
                  title="No cadences yet."
                  hint="Build a multi-touch sequence — like “One Chesslang $9/mo outreach” — to track its touches, audience and blockers."
               />
            </div>
         )}

         <Stagger className="space-y-4">
            {list.map((c) => {
               const st = STATUS_META[c.status] ?? STATUS_META.draft;
               return (
                  <Item key={c.key} className="rounded-xl border bg-container p-4 sm:p-5">
                     <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                           <Radio className="size-4 text-primary" />
                           <span className="font-medium">{c.name}</span>
                           <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>
                              {st.label}
                           </span>
                           {c.audienceText && (
                              <span className="text-xs text-muted-foreground">
                                 · {c.audienceText}
                              </span>
                           )}
                           {c.chans.map((ch) => (
                              <span
                                 key={ch}
                                 className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              >
                                 <ChannelIcon channel={ch} className="size-3" /> {ch}
                              </span>
                           ))}
                           {c.linkIdentifier && (
                              <Link
                                 href={`/${orgId || 'shortcastle'}/issue/${c.linkIdentifier}`}
                                 className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                 <Link2 className="size-3" /> {c.linkIdentifier}
                              </Link>
                           )}
                           {c.source === 'feed' && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                 synced
                              </span>
                           )}
                        </div>
                        {c.source === 'db' && c.editId && (
                           <div className="flex shrink-0 items-center gap-1">
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 onClick={() => setEditing(c.editId!)}
                              >
                                 <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 onClick={async () => {
                                    if (
                                       await confirm({
                                          title: 'Delete this cadence?',
                                          danger: true,
                                          confirmText: 'Delete',
                                       })
                                    ) {
                                       await fetch(`/api/ops/cadences/${c.editId}`, {
                                          method: 'DELETE',
                                       });
                                       load();
                                    }
                                 }}
                              >
                                 <Trash2 className="size-3.5" />
                              </Button>
                           </div>
                        )}
                     </div>

                     {/* full-width horizontal step timeline */}
                     <div className="mt-3">
                        <StepTimeline
                           steps={c.steps}
                           closedNote={
                              c.status === 'closed'
                                 ? 'Sent manually — no automated cadence steps.'
                                 : undefined
                           }
                        />
                     </div>

                     {c.blockers.length > 0 && (
                        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5">
                           <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-red-500">
                              <AlertTriangle className="size-3.5" /> Blocked on
                           </div>
                           <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground/80">
                              {c.blockers.map((b, i) => (
                                 <li key={i}>{b}</li>
                              ))}
                           </ul>
                        </div>
                     )}

                     {c.notes && (
                        <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                           {c.notes}
                        </p>
                     )}
                  </Item>
               );
            })}
         </Stagger>

         {editing && (
            <CadenceEditor
               initial={editing === 'new' ? null : (cadences.find((c) => c.id === editing) ?? null)}
               issues={issues.map((i) => ({ id: i.id, identifier: i.identifier, title: i.title }))}
               onClose={() => setEditing(null)}
               onSaved={() => {
                  setEditing(null);
                  load();
               }}
            />
         )}
      </div>
   );
}

function CadenceEditor({
   initial,
   issues,
   onClose,
   onSaved,
}: {
   initial: Cadence | null;
   issues: { id: string; identifier: string; title: string }[];
   onClose: () => void;
   onSaved: () => void;
}) {
   const [d, setD] = useState(() =>
      initial
         ? {
              name: initial.name,
              audience: initial.audience,
              channels: initial.channels,
              status: initial.status,
              issue_id: initial.issue_id ?? '',
              touches: initial.touches.slice().sort((a, b) => a.n - b.n),
              blockers: initial.blockers.join('\n'),
              notes: initial.notes,
           }
         : emptyDraft()
   );
   const [busy, setBusy] = useState(false);
   const activeWorkspace = useActiveWorkspaceStore((s) => s.active);
   useEscape(onClose);

   const channelList = () =>
      d.channels
         .split(',')
         .map((x) => x.trim())
         .filter(Boolean);
   const toggleChan = (c: string) => {
      const set = new Set(channelList());
      if (set.has(c)) set.delete(c);
      else set.add(c);
      setD({ ...d, channels: Array.from(set).join(',') });
   };

   const addTouch = () =>
      setD({
         ...d,
         touches: [
            ...d.touches,
            {
               n: d.touches.length + 1,
               channel: 'email',
               label: '',
               timing: '',
               status: 'planned',
               sent: null,
            },
         ],
      });
   const setTouch = (i: number, patch: Partial<Touch>) =>
      setD({ ...d, touches: d.touches.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
   const rmTouch = (i: number) =>
      setD({
         ...d,
         touches: d.touches.filter((_, j) => j !== i).map((t, k) => ({ ...t, n: k + 1 })),
      });

   const save = async () => {
      if (!d.name.trim()) return;
      setBusy(true);
      const payload = {
         name: d.name.trim(),
         audience: d.audience,
         channels: d.channels,
         status: d.status,
         issue_id: d.issue_id || null,
         touches: d.touches,
         blockers: d.blockers
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
         notes: d.notes,
      };
      const r = initial
         ? await fetch(`/api/ops/cadences/${initial.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
           })
         : await fetch('/api/ops/cadences', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                 ...payload,
                 workspace: activeWorkspace !== ALL_WORKSPACES ? activeWorkspace : null,
              }),
           });
      setBusy(false);
      if (r.ok) onSaved();
      else toast.error('Failed to save cadence');
   };

   const field =
      'w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary';

   return (
      <div
         className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
         onClick={onClose}
      >
         <div
            className="my-6 w-full max-w-lg rounded-xl border bg-container p-5"
            onClick={(e) => e.stopPropagation()}
         >
            <p className="mb-3 text-sm font-semibold">{initial ? 'Edit cadence' : 'New cadence'}</p>
            <div className="space-y-3">
               <input
                  value={d.name}
                  onChange={(e) => setD({ ...d, name: e.target.value })}
                  placeholder="Cadence name"
                  autoFocus
                  className={field}
               />
               <input
                  value={d.audience}
                  onChange={(e) => setD({ ...d, audience: e.target.value })}
                  placeholder="Audience (e.g. 117 non-converted demo attendees)"
                  className={field}
               />

               <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm">
                     <span className="text-xs text-muted-foreground">Channels:</span>
                     {['email', 'whatsapp'].map((c) => (
                        <button
                           key={c}
                           type="button"
                           onClick={() => toggleChan(c)}
                           className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${channelList().includes(c) ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground'}`}
                        >
                           <ChannelIcon channel={c} className="size-3" /> {c}
                        </button>
                     ))}
                  </div>
                  <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v })}>
                     <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {STATUSES.map((s) => (
                           <SelectItem key={s} value={s}>
                              {STATUS_META[s].label}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>

               <Select
                  value={d.issue_id || '__none'}
                  onValueChange={(v) => setD({ ...d, issue_id: v === '__none' ? '' : v })}
               >
                  <SelectTrigger className="w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="__none">Link to a task (optional)</SelectItem>
                     {issues.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                           {i.identifier} — {i.title}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>

               {/* touches */}
               <div>
                  <div className="mb-1.5 flex items-center justify-between">
                     <span className="text-xs font-medium text-muted-foreground">Touches</span>
                     <Button size="xs" variant="ghost" onClick={addTouch}>
                        <Plus className="mr-0.5 size-3.5" /> Add touch
                     </Button>
                  </div>
                  <div className="space-y-1.5">
                     {d.touches.map((t, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                           <span className="w-4 text-center text-[11px] text-muted-foreground">
                              {t.n}
                           </span>
                           <Select
                              value={t.channel}
                              onValueChange={(v) => setTouch(i, { channel: v })}
                           >
                              <SelectTrigger className="h-7 w-[104px] px-2 text-xs">
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 <SelectItem value="email">email</SelectItem>
                                 <SelectItem value="whatsapp">whatsapp</SelectItem>
                              </SelectContent>
                           </Select>
                           <input
                              value={t.label}
                              onChange={(e) => setTouch(i, { label: e.target.value })}
                              placeholder="what it says"
                              className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
                           />
                           <input
                              value={t.timing}
                              onChange={(e) => setTouch(i, { timing: e.target.value })}
                              placeholder="Day 0"
                              className="w-16 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
                           />
                           <Select
                              value={t.status}
                              onValueChange={(v) => setTouch(i, { status: v })}
                           >
                              <SelectTrigger className="h-7 w-[96px] px-2 text-xs">
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 <SelectItem value="planned">planned</SelectItem>
                                 <SelectItem value="sent">sent</SelectItem>
                                 <SelectItem value="skipped">skipped</SelectItem>
                              </SelectContent>
                           </Select>
                           <button
                              type="button"
                              onClick={() => rmTouch(i)}
                              className="text-muted-foreground hover:text-red-500"
                           >
                              <Trash2 className="size-3.5" />
                           </button>
                        </div>
                     ))}
                     {d.touches.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                           No touches yet — add the sequence steps.
                        </p>
                     )}
                  </div>
               </div>

               <label className="block text-xs text-muted-foreground">
                  Blockers (one per line)
                  <textarea
                     value={d.blockers}
                     onChange={(e) => setD({ ...d, blockers: e.target.value })}
                     rows={2}
                     placeholder={'Real promocode — Ved to create\n$9 checkout link'}
                     className={`${field} mt-1 resize-y`}
                  />
               </label>
               <label className="block text-xs text-muted-foreground">
                  Notes
                  <textarea
                     value={d.notes}
                     onChange={(e) => setD({ ...d, notes: e.target.value })}
                     rows={2}
                     className={`${field} mt-1 resize-y`}
                  />
               </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
               <Button size="sm" variant="ghost" onClick={onClose}>
                  Cancel
               </Button>
               <Button size="sm" disabled={busy || !d.name.trim()} onClick={save}>
                  {initial ? 'Save' : 'Create'}
               </Button>
            </div>
         </div>
      </div>
   );
}
