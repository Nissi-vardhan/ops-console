'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Mail, MessageCircle, Plus, Pencil, Trash2, Radio, AlertTriangle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIssuesStore } from '@/store/issues-store';

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
   updated_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
   draft: { label: 'Draft', cls: 'bg-muted/60 text-muted-foreground' },
   live: { label: 'Live', cls: 'bg-emerald-500/15 text-emerald-500' },
   paused: { label: 'Paused', cls: 'bg-amber-500/15 text-amber-500' },
   blocked: { label: 'Blocked', cls: 'bg-red-500/15 text-red-500' },
   done: { label: 'Done', cls: 'bg-[#5e6ad2]/15 text-[#8b93e0]' },
};
const STATUSES = Object.keys(STATUS_META);

const ChannelIcon = ({ channel, className }: { channel: string; className?: string }) =>
   channel === 'whatsapp' ? <MessageCircle className={className} /> : <Mail className={className} />;

const emptyDraft = () => ({ name: '', audience: '', channels: 'email,whatsapp', status: 'draft', issue_id: '', touches: [] as Touch[], blockers: '', notes: '' });

export function CadencesView() {
   const [cadences, setCadences] = useState<Cadence[]>([]);
   const [loading, setLoading] = useState(true);
   const [editing, setEditing] = useState<null | 'new' | string>(null);
   const issues = useIssuesStore((s) => s.issues);
   const { orgId } = useParams<{ orgId: string }>();

   const load = useCallback(async () => {
      const d = await fetch('/api/ops/cadences', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setCadences((d?.cadences ?? []) as Cadence[]);
      setLoading(false);
   }, []);
   useEffect(() => { load(); }, [load]);

   const issueOf = (id: string | null) => (id ? issues.find((i) => i.id === id) : undefined);

   const totals = useMemo(() => ({
      total: cadences.length,
      live: cadences.filter((c) => c.status === 'live').length,
      blocked: cadences.filter((c) => c.status === 'blocked' || c.blockers.length > 0).length,
   }), [cadences]);

   return (
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
         <div className="flex items-center justify-between">
            <div>
               <h1 className="text-lg font-semibold">Cadences</h1>
               <p className="text-sm text-muted-foreground">Multi-touch email + WhatsApp sequences, tracked as first-class flows.</p>
            </div>
            <Button size="sm" onClick={() => setEditing('new')}><Plus className="mr-1 size-4" /> New cadence</Button>
         </div>

         <div className="grid grid-cols-3 gap-3">
            {[
               { label: 'Cadences', value: totals.total, tint: 'text-foreground' },
               { label: 'Live', value: totals.live, tint: 'text-emerald-500' },
               { label: 'Blocked', value: totals.blocked, tint: 'text-red-500' },
            ].map((s) => (
               <div key={s.label} className="rounded-lg border bg-container p-3">
                  <div className={`text-2xl font-semibold tabular-nums ${s.tint}`}>{s.value}</div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
               </div>
            ))}
         </div>

         {!loading && cadences.length === 0 && (
            <div className="rounded-lg border bg-container p-8 text-center text-sm text-muted-foreground">
               No cadences yet. Create one (e.g. &quot;One Chesslang $9/mo outreach&quot;) to track its touches, audience and blockers.
            </div>
         )}

         <div className="space-y-4">
            {cadences.map((c) => {
               const st = STATUS_META[c.status] ?? STATUS_META.draft;
               const linked = issueOf(c.issue_id);
               const chans = c.channels.split(',').map((x) => x.trim()).filter(Boolean);
               return (
                  <div key={c.id} className="rounded-xl border bg-container p-4">
                     <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                           <Radio className="size-4 text-[#8b93e0]" />
                           <span className="font-medium">{c.name}</span>
                           <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                           <Button size="xs" variant="ghost" onClick={() => setEditing(c.id)}><Pencil className="size-3.5" /></Button>
                           <Button size="xs" variant="ghost" onClick={async () => { if (confirm('Delete this cadence?')) { await fetch(`/api/ops/cadences/${c.id}`, { method: 'DELETE' }); load(); } }}>
                              <Trash2 className="size-3.5" />
                           </Button>
                        </div>
                     </div>

                     <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {c.audience && <span><span className="text-foreground/70">Audience:</span> {c.audience}</span>}
                        <span className="flex items-center gap-1.5">
                           {chans.map((ch) => (
                              <span key={ch} className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5">
                                 <ChannelIcon channel={ch} className="size-3" /> {ch}
                              </span>
                           ))}
                        </span>
                        {linked && (
                           <Link href={`/${orgId || 'lndev-ui'}/issue/${linked.identifier}`} className="inline-flex items-center gap-1 text-[#8b93e0] hover:underline">
                              <Link2 className="size-3" /> {linked.identifier}
                           </Link>
                        )}
                     </div>

                     {/* touch timeline */}
                     {c.touches.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                           {c.touches.slice().sort((a, b) => a.n - b.n).map((t, idx) => {
                              const done = t.status === 'sent';
                              const skipped = t.status === 'skipped';
                              return (
                                 <div key={idx} className="flex items-center gap-2.5 text-xs">
                                    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${done ? 'bg-emerald-500/20 text-emerald-500' : skipped ? 'bg-muted/60 text-muted-foreground line-through' : 'border text-muted-foreground'}`}>{t.n}</span>
                                    <ChannelIcon channel={t.channel} className={`size-3.5 shrink-0 ${done ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                                    <span className={`${skipped ? 'text-muted-foreground line-through' : ''}`}>{t.label || '(untitled touch)'}</span>
                                    {t.timing && <span className="text-muted-foreground">· {t.timing}</span>}
                                    {done && <span className="ml-auto text-emerald-500">{t.sent != null ? `sent ${t.sent}` : 'sent'}</span>}
                                    {!done && !skipped && <span className="ml-auto text-muted-foreground">planned</span>}
                                 </div>
                              );
                           })}
                        </div>
                     )}

                     {/* blockers */}
                     {c.blockers.length > 0 && (
                        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-2.5">
                           <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-red-500"><AlertTriangle className="size-3.5" /> Blocked on</div>
                           <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground/80">
                              {c.blockers.map((b, i) => <li key={i}>{b}</li>)}
                           </ul>
                        </div>
                     )}

                     {c.notes && <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">{c.notes}</p>}
                  </div>
               );
            })}
         </div>

         {editing && (
            <CadenceEditor
               initial={editing === 'new' ? null : cadences.find((c) => c.id === editing) ?? null}
               issues={issues.map((i) => ({ id: i.id, identifier: i.identifier, title: i.title }))}
               onClose={() => setEditing(null)}
               onSaved={() => { setEditing(null); load(); }}
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

   const channelList = () => d.channels.split(',').map((x) => x.trim()).filter(Boolean);
   const toggleChan = (c: string) => {
      const set = new Set(channelList());
      if (set.has(c)) set.delete(c);
      else set.add(c);
      setD({ ...d, channels: Array.from(set).join(',') });
   };

   const addTouch = () =>
      setD({ ...d, touches: [...d.touches, { n: d.touches.length + 1, channel: 'email', label: '', timing: '', status: 'planned', sent: null }] });
   const setTouch = (i: number, patch: Partial<Touch>) =>
      setD({ ...d, touches: d.touches.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
   const rmTouch = (i: number) =>
      setD({ ...d, touches: d.touches.filter((_, j) => j !== i).map((t, k) => ({ ...t, n: k + 1 })) });

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
         blockers: d.blockers.split('\n').map((s) => s.trim()).filter(Boolean),
         notes: d.notes,
      };
      const r = initial
         ? await fetch(`/api/ops/cadences/${initial.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
         : await fetch('/api/ops/cadences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      setBusy(false);
      if (r.ok) onSaved(); else alert('Failed to save cadence');
   };

   const field = 'w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-[#5e6ad2]';

   return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
         <div className="my-6 w-full max-w-lg rounded-xl border bg-container p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold">{initial ? 'Edit cadence' : 'New cadence'}</p>
            <div className="space-y-3">
               <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Cadence name" autoFocus className={field} />
               <input value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value })} placeholder="Audience (e.g. 117 non-converted demo attendees)" className={field} />

               <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm">
                     <span className="text-xs text-muted-foreground">Channels:</span>
                     {['email', 'whatsapp'].map((c) => (
                        <button key={c} type="button" onClick={() => toggleChan(c)}
                           className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${channelList().includes(c) ? 'border-[#5e6ad2] bg-[#5e6ad2]/10 text-foreground' : 'text-muted-foreground'}`}>
                           <ChannelIcon channel={c} className="size-3" /> {c}
                        </button>
                     ))}
                  </div>
                  <select value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })} className="rounded-md border bg-background px-2 py-1.5 text-sm">
                     {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
               </div>

               <select value={d.issue_id} onChange={(e) => setD({ ...d, issue_id: e.target.value })} className={field}>
                  <option value="">Link to a task (optional)</option>
                  {issues.map((i) => <option key={i.id} value={i.id}>{i.identifier} — {i.title}</option>)}
               </select>

               {/* touches */}
               <div>
                  <div className="mb-1.5 flex items-center justify-between">
                     <span className="text-xs font-medium text-muted-foreground">Touches</span>
                     <Button size="xs" variant="ghost" onClick={addTouch}><Plus className="mr-0.5 size-3.5" /> Add touch</Button>
                  </div>
                  <div className="space-y-1.5">
                     {d.touches.map((t, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                           <span className="w-4 text-center text-[11px] text-muted-foreground">{t.n}</span>
                           <select value={t.channel} onChange={(e) => setTouch(i, { channel: e.target.value })} className="rounded border bg-background px-1 py-1 text-xs">
                              <option value="email">email</option>
                              <option value="whatsapp">whatsapp</option>
                           </select>
                           <input value={t.label} onChange={(e) => setTouch(i, { label: e.target.value })} placeholder="what it says" className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-[#5e6ad2]" />
                           <input value={t.timing} onChange={(e) => setTouch(i, { timing: e.target.value })} placeholder="Day 0" className="w-16 rounded border bg-background px-1.5 py-1 text-xs outline-none focus:border-[#5e6ad2]" />
                           <select value={t.status} onChange={(e) => setTouch(i, { status: e.target.value })} className="rounded border bg-background px-1 py-1 text-xs">
                              <option value="planned">planned</option>
                              <option value="sent">sent</option>
                              <option value="skipped">skipped</option>
                           </select>
                           <button type="button" onClick={() => rmTouch(i)} className="text-muted-foreground hover:text-red-500"><Trash2 className="size-3.5" /></button>
                        </div>
                     ))}
                     {d.touches.length === 0 && <p className="text-[11px] text-muted-foreground">No touches yet — add the sequence steps.</p>}
                  </div>
               </div>

               <label className="block text-xs text-muted-foreground">Blockers (one per line)
                  <textarea value={d.blockers} onChange={(e) => setD({ ...d, blockers: e.target.value })} rows={2} placeholder={'Real promocode — Ved to create\n$9 checkout link'} className={`${field} mt-1 resize-y`} />
               </label>
               <label className="block text-xs text-muted-foreground">Notes
                  <textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} rows={2} className={`${field} mt-1 resize-y`} />
               </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
               <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
               <Button size="sm" disabled={busy || !d.name.trim()} onClick={save}>{initial ? 'Save' : 'Create'}</Button>
            </div>
         </div>
      </div>
   );
}
