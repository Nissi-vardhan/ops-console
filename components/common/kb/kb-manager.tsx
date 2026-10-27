'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
   CircleHelp,
   FileText,
   MessageSquare,
   Plus,
   Search,
   Send,
   Trash2,
   Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { WORKSPACES } from '@/lib/workspaces';
import { useActiveWorkspaceStore, ALL_WORKSPACES } from '@/store/active-workspace-store';

// Knowledge Base manager (SC-418), owners only: per product, which articles the bots
// answer from (Live = production), drafts waiting for review, the questions the KB
// couldn't answer, and a playground to ask as the bot would.

type Filter = 'all' | 'live' | 'review' | 'gaps';
interface Row {
   id: string;
   title: string;
   snippet: string;
   live: boolean;
   draft_of: string | null;
   has_video: boolean;
   audience: Audience;
   updated_at: string;
}
interface Gap {
   question: string;
   times: number;
   last_at: string;
   ids: string[];
   audience: Audience;
}
// SC-436: support = bots may use it; marketing = team only (positioning, personas, campaigns).
type Audience = 'support' | 'marketing';
const AUD_LABEL: Record<Audience, string> = { support: 'Support', marketing: 'Marketing' };
const AUD_CLS: Record<Audience, string> = {
   support: 'border-sky-500/40 text-sky-700 dark:text-sky-300',
   marketing: 'border-fuchsia-500/40 text-fuchsia-700 dark:text-fuchsia-300',
};
interface PushKey {
   id: string;
   label: string;
   prefix: string;
   created_at: string;
   last_used_at: string | null;
   revoked_at: string | null;
}
interface Counts {
   all: number;
   live: number;
   review: number;
   gaps: number;
}
interface Reply {
   q: string;
   pending?: boolean;
   answer?: string;
   answered?: boolean;
   error?: string;
   sources?: { id: string; title: string }[];
}

const WS_KEY = 'ops.kb.ws';
const ago = (iso: string) => {
   const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
   return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

export function KbManager() {
   const { orgId } = useParams<{ orgId: string }>();
   const [ws, setWs] = useState('chesslang');
   const [filter, setFilter] = useState<Filter>('all');
   const [q, setQ] = useState('');
   const [aud, setAud] = useState<'all' | Audience>('all');
   const [rows, setRows] = useState<Row[]>([]);
   const [gaps, setGaps] = useState<Gap[]>([]);
   const [counts, setCounts] = useState<Counts | null>(null);
   const [keys, setKeys] = useState<PushKey[]>([]);
   const [keysOpen, setKeysOpen] = useState(false);
   const [freshKey, setFreshKey] = useState<string | null>(null);
   const [denied, setDenied] = useState(false);
   const [busy, setBusy] = useState<string | null>(null);
   const [draft, setDraft] = useState<{
      title: string;
      body: string;
      gapIds: string[];
      audience: Audience;
   } | null>(null);
   const [toDelete, setToDelete] = useState<Row | null>(null);
   const [ask, setAsk] = useState('');
   const [replies, setReplies] = useState<Reply[]>([]);

   const active = useActiveWorkspaceStore((s) => s.active);
   useEffect(() => {
      try {
         const saved = localStorage.getItem(WS_KEY);
         if (saved && WORKSPACES.some((w) => w.slug === saved)) setWs(saved);
      } catch {}
   }, []);
   // Picking one product in the top bar switches this page to it.
   useEffect(() => {
      if (active !== ALL_WORKSPACES && WORKSPACES.some((w) => w.slug === active)) {
         setWs(active);
         setReplies([]);
      }
   }, [active]);

   const load = useCallback(async () => {
      const f = filter === 'gaps' ? 'all' : filter;
      const r = await fetch(
         `/api/ops/kb-admin?ws=${ws}&filter=${f}&audience=${aud}&q=${encodeURIComponent(q.trim())}`,
         { cache: 'no-store' }
      ).catch(() => null);
      if (r?.status === 403 || r?.status === 401) return setDenied(true);
      if (!r?.ok) return;
      const d = await r.json();
      setRows(d.docs);
      setGaps(d.gaps);
      setCounts(d.counts);
      setKeys(d.keys ?? []);
   }, [ws, filter, q, aud]);
   useEffect(() => {
      const t = setTimeout(load, 200);
      return () => clearTimeout(t);
   }, [load]);

   const pickWs = (slug: string) => {
      setWs(slug);
      setReplies([]);
      try {
         localStorage.setItem(WS_KEY, slug);
      } catch {}
   };

   const post = async (body: object) => {
      const r = await fetch('/api/ops/kb-admin', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      if (!r?.ok) toast.error(d?.error || 'Something went wrong');
      return r?.ok ? d : null;
   };

   const toggle = async (row: Row, live: boolean) => {
      setBusy(row.id);
      const d = await post({ action: 'toggle', id: row.id, live });
      setBusy(null);
      if (d) toast.success(live ? 'Live: the bots can answer from it now' : 'Taken off live');
      load();
   };

   const remove = async (row: Row) => {
      setToDelete(null);
      const r = await fetch(`/api/ops/docs/${row.id}`, { method: 'DELETE' }).catch(() => null);
      if (r?.ok) toast.success('Article deleted');
      else toast.error('Could not delete');
      load();
   };

   const saveDraft = async (goLive: boolean) => {
      if (!draft || !draft.title.trim()) return toast.error('Give it a title');
      const r = await fetch('/api/ops/docs', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            title: draft.title.trim(),
            body: draft.body,
            category: 'KB',
            workspace: ws,
            kb_audience: draft.audience,
         }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      if (!r?.ok || !d?.doc?.id) return toast.error(d?.error || 'Could not save');
      if (goLive) await post({ action: 'toggle', id: d.doc.id, live: true });
      if (draft.gapIds.length) await post({ action: 'resolve', ids: draft.gapIds });
      toast.success(goLive ? 'Article is live' : 'Saved to Needs review');
      setDraft(null);
      load();
   };

   const [bulkBusy, setBulkBusy] = useState(false);
   const makeAllLive = async () => {
      const ids = rows.filter((r) => !r.live).map((r) => r.id);
      if (!ids.length) return;
      if (
         !window.confirm(
            `Make ${ids.length} article${ids.length === 1 ? '' : 's'} live? Support articles become visible to the bots right away.`
         )
      )
         return;
      setBulkBusy(true);
      const d = await post({ action: 'bulk_live', ws, ids });
      setBulkBusy(false);
      if (d)
         toast.success(
            `${d.done} made live${d.failed?.length ? `, ${d.failed.length} skipped` : ''}`
         );
      load();
   };

   const setAudience = async (row: Row, audience: Audience) => {
      setBusy(row.id);
      const d = await post({ action: 'audience', id: row.id, audience });
      setBusy(null);
      if (d)
         toast.success(
            audience === 'marketing'
               ? 'Marketing: team only, never sent to bots'
               : 'Support: bots may use it'
         );
      load();
   };

   const createKey = async () => {
      const label = window.prompt('Who is this key for? (e.g. "Trainerstack docs, Saikiran")');
      if (label === null) return;
      const d = await post({ action: 'key_create', ws, label });
      if (d?.token) setFreshKey(d.token);
      load();
   };
   const revokeKey = async (k: PushKey) => {
      if (!window.confirm(`Revoke "${k.label}"? It stops working at once.`)) return;
      if (await post({ action: 'key_revoke', ws, id: k.id })) toast.success('Key revoked');
      load();
   };

   const resolve = async (g: Gap) => {
      if (await post({ action: 'resolve', ids: g.ids })) load();
   };

   const play = async () => {
      const question = ask.trim();
      if (question.length < 3) return;
      setAsk('');
      const turn: Reply = { q: question, pending: true };
      setReplies((t) => [...t, turn]);
      const r = await fetch('/api/ops/ask', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ question, workspace: ws, staging: false }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      setReplies((t) =>
         t.map((x) =>
            x === turn
               ? r?.ok && d
                  ? { ...x, pending: false, ...d }
                  : { ...x, pending: false, error: d?.error || 'Something went wrong' }
               : x
         )
      );
      if (r?.ok && d && !d.answered) load();
   };

   if (denied)
      return (
         <div className="mt-24 text-center text-sm text-muted-foreground">
            The Knowledge Base page is for owners only.
         </div>
      );

   const tabs: { key: Filter; label: string; n?: number }[] = [
      { key: 'all', label: 'All', n: counts?.all },
      { key: 'live', label: 'Live', n: counts?.live },
      { key: 'review', label: 'Needs review', n: counts?.review },
      { key: 'gaps', label: 'Unanswered questions', n: counts?.gaps },
   ];

   return (
      <div className="flex h-full w-full flex-col overflow-hidden lg:flex-row">
         <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
               <select
                  value={ws}
                  onChange={(e) => pickWs(e.target.value)}
                  className="min-h-9 rounded-md border bg-background px-2 text-sm"
                  aria-label="Product"
               >
                  {WORKSPACES.map((w) => (
                     <option key={w.slug} value={w.slug}>
                        {w.name}
                     </option>
                  ))}
               </select>
               <div className="relative min-w-40 flex-1">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                     value={q}
                     onChange={(e) => setQ(e.target.value)}
                     placeholder="Search articles"
                     className="h-9 pl-8"
                  />
               </div>
               <select
                  value={aud}
                  onChange={(e) => setAud(e.target.value as 'all' | Audience)}
                  className="min-h-9 rounded-md border bg-background px-2 text-sm"
                  aria-label="Audience"
               >
                  <option value="all">Support + Marketing</option>
                  <option value="support">Support (bots)</option>
                  <option value="marketing">Marketing (team)</option>
               </select>
               <Button size="sm" variant="outline" onClick={() => setKeysOpen(true)}>
                  Push keys
                  {keys.filter((k) => !k.revoked_at).length
                     ? ` (${keys.filter((k) => !k.revoked_at).length})`
                     : ''}
               </Button>
               <Button
                  size="sm"
                  onClick={() =>
                     setDraft({
                        title: '',
                        body: '',
                        gapIds: [],
                        audience: aud === 'marketing' ? 'marketing' : 'support',
                     })
                  }
               >
                  <Plus className="size-4" /> New article
               </Button>
            </div>

            <div className="flex gap-1 overflow-x-auto border-b px-4 py-2">
               {tabs.map((t) => (
                  <button
                     key={t.key}
                     onClick={() => setFilter(t.key)}
                     className={`min-h-8 shrink-0 rounded-full px-3 text-xs font-medium ${
                        filter === t.key
                           ? 'bg-primary text-primary-foreground'
                           : 'text-muted-foreground hover:bg-muted'
                     }`}
                  >
                     {t.label}
                     {t.n !== undefined && <span className="ml-1 opacity-70">{t.n}</span>}
                  </button>
               ))}
            </div>

            {filter === 'review' && rows.some((r) => !r.live) && (
               <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
                  <span>
                     {rows.filter((r) => !r.live).length} waiting
                     {aud !== 'all' ? ` · ${AUD_LABEL[aud]} only` : ''}
                     {q.trim() ? ' · matching your search' : ''}
                  </span>
                  <Button size="sm" className="ml-auto" disabled={bulkBusy} onClick={makeAllLive}>
                     {bulkBusy
                        ? 'Making live…'
                        : `Make all live (${rows.filter((r) => !r.live).length})`}
                  </Button>
               </div>
            )}

            <div className="flex-1 overflow-y-auto">
               {filter === 'gaps' ? (
                  gaps.length === 0 ? (
                     <p className="mt-16 text-center text-sm text-muted-foreground">
                        No unanswered questions for this product.
                     </p>
                  ) : (
                     <ul className="divide-y">
                        {gaps.map((g) => (
                           <li
                              key={g.ids[0]}
                              className="flex flex-wrap items-center gap-3 px-4 py-3"
                           >
                              <CircleHelp className="size-4 shrink-0 text-amber-500" />
                              <div className="min-w-0 flex-1">
                                 <p className="text-sm [overflow-wrap:anywhere]">{g.question}</p>
                                 <p className="text-xs text-muted-foreground">
                                    Asked {g.times}× · last {ago(g.last_at)}
                                    {g.audience === 'marketing' && ' · from Marketing'}
                                 </p>
                              </div>
                              <Button
                                 size="sm"
                                 variant="outline"
                                 onClick={() =>
                                    setDraft({
                                       title: g.question,
                                       body: '',
                                       gapIds: g.ids,
                                       audience: g.audience ?? 'support',
                                    })
                                 }
                              >
                                 Write article
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => resolve(g)}>
                                 Dismiss
                              </Button>
                           </li>
                        ))}
                     </ul>
                  )
               ) : rows.length === 0 ? (
                  <p className="mt-16 text-center text-sm text-muted-foreground">
                     {counts ? 'No articles here.' : 'Loading…'}
                  </p>
               ) : (
                  <ul className="divide-y">
                     {rows.map((r) => (
                        <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                           <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                           <Link
                              href={`/${orgId}/docs?doc=${r.id}`}
                              className="min-w-0 flex-1 hover:underline-offset-2"
                           >
                              <p className="flex items-center gap-1.5 text-sm font-medium [overflow-wrap:anywhere]">
                                 {r.title}
                                 {r.has_video && (
                                    <Video className="size-3.5 text-muted-foreground" />
                                 )}
                              </p>
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                 {r.draft_of ? 'Edit waiting for review · ' : ''}
                                 {r.snippet}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                 Updated {ago(r.updated_at)}
                              </p>
                           </Link>
                           <select
                              value={r.audience}
                              disabled={busy === r.id}
                              onChange={(e) => setAudience(r, e.target.value as Audience)}
                              className={`h-7 shrink-0 rounded-full border bg-transparent px-2 text-xs ${AUD_CLS[r.audience]}`}
                              aria-label="Who it's for"
                              title="Support: bots may use it · Marketing: team only"
                           >
                              <option value="support">{AUD_LABEL.support}</option>
                              <option value="marketing">{AUD_LABEL.marketing}</option>
                           </select>
                           <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                              <Switch
                                 checked={r.live}
                                 disabled={busy === r.id}
                                 onCheckedChange={(v) => toggle(r, v)}
                                 aria-label="Live"
                              />
                              <span className="w-8">{r.live ? 'Live' : 'Off'}</span>
                           </label>
                           <button
                              onClick={() => setToDelete(r)}
                              className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"
                              aria-label="Delete"
                           >
                              <Trash2 className="size-4" />
                           </button>
                        </li>
                     ))}
                  </ul>
               )}
            </div>
         </div>

         <aside className="flex h-80 shrink-0 flex-col border-t lg:h-auto lg:w-96 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-1.5 border-b px-4 py-2.5 text-sm font-medium">
               <MessageSquare className="size-4" /> Playground
               <span className="text-xs font-normal text-muted-foreground">
                  · live articles only, as the bot sees them
               </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
               {replies.length === 0 && (
                  <p className="mt-8 text-center text-xs text-muted-foreground">
                     Ask a customer question to see how the KB answers it.
                  </p>
               )}
               {replies.map((t, i) => (
                  <div key={i} className="space-y-1.5 text-sm">
                     <div className="ml-auto w-fit max-w-[90%] rounded-2xl bg-primary/10 px-3 py-1.5 [overflow-wrap:anywhere]">
                        {t.q}
                     </div>
                     <div className="max-w-[95%] rounded-2xl border px-3 py-2 leading-relaxed">
                        {t.pending ? (
                           <span className="text-muted-foreground">Thinking…</span>
                        ) : t.error ? (
                           <span className="text-red-500">{t.error}</span>
                        ) : (
                           <>
                              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                                 {t.answer}
                              </p>
                              {!t.answered && (
                                 <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                    Not in the KB: added to Unanswered questions.
                                 </p>
                              )}
                              {t.sources && t.sources.length > 0 && (
                                 <div className="mt-1.5 flex flex-wrap gap-1 border-t pt-1.5">
                                    {t.sources.map((s) => (
                                       <Link
                                          key={s.id}
                                          href={`/${orgId}/docs?doc=${s.id}`}
                                          className="max-w-full truncate rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted/50"
                                       >
                                          {s.title}
                                       </Link>
                                    ))}
                                 </div>
                              )}
                           </>
                        )}
                     </div>
                  </div>
               ))}
            </div>
            <form
               className="flex gap-2 border-t px-4 py-2.5"
               onSubmit={(e) => {
                  e.preventDefault();
                  play();
               }}
            >
               <Input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder="Ask as a customer would"
                  className="h-9"
               />
               <Button size="sm" type="submit" aria-label="Ask">
                  <Send className="size-4" />
               </Button>
            </form>
         </aside>

         <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
            <DialogContent className="sm:max-w-2xl">
               <DialogHeader>
                  <DialogTitle>
                     New article · {WORKSPACES.find((w) => w.slug === ws)?.name}
                  </DialogTitle>
               </DialogHeader>
               {draft && (
                  <div className="space-y-2">
                     <Input
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        placeholder="Title (e.g. the question customers ask)"
                     />
                     <div className="flex flex-wrap gap-2 text-sm">
                        {(['support', 'marketing'] as Audience[]).map((a) => (
                           <label
                              key={a}
                              className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 ${
                                 draft.audience === a ? AUD_CLS[a] : 'text-muted-foreground'
                              }`}
                           >
                              <input
                                 type="radio"
                                 checked={draft.audience === a}
                                 onChange={() => setDraft({ ...draft, audience: a })}
                              />
                              {a === 'support'
                                 ? 'Support (bots may use it)'
                                 : 'Marketing (team only)'}
                           </label>
                        ))}
                     </div>
                     <Textarea
                        value={draft.body}
                        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                        placeholder="The answer, in markdown"
                        className="min-h-60"
                     />
                     {draft.gapIds.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                           Saving marks this question as handled.
                        </p>
                     )}
                  </div>
               )}
               <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => saveDraft(false)}>
                     Save for review
                  </Button>
                  <Button onClick={() => saveDraft(true)}>Save and go live</Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog
            open={keysOpen}
            onOpenChange={(o) => {
               setKeysOpen(o);
               if (!o) setFreshKey(null);
            }}
         >
            <DialogContent className="sm:max-w-lg">
               <DialogHeader>
                  <DialogTitle>
                     Push keys · {WORKSPACES.find((w) => w.slug === ws)?.name}
                  </DialogTitle>
               </DialogHeader>
               <p className="text-sm text-muted-foreground">
                  Lets an outside team push KB articles into this product only. Everything they push
                  lands in Needs review; nothing goes live until you switch it on.
               </p>
               {freshKey && (
                  <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                     <p className="font-medium">Copy this key now. It won&apos;t be shown again.</p>
                     <code className="block break-all rounded bg-background px-2 py-1 font-mono">
                        {freshKey}
                     </code>
                     <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                           navigator.clipboard
                              .writeText(freshKey)
                              .then(() => toast.success('Copied'))
                        }
                     >
                        Copy
                     </Button>
                  </div>
               )}
               <ul className="divide-y rounded-md border text-sm">
                  {keys.length === 0 && <li className="p-3 text-muted-foreground">No keys yet.</li>}
                  {keys.map((k) => (
                     <li key={k.id} className="flex flex-wrap items-center gap-2 p-3">
                        <div className="min-w-0 flex-1">
                           <p className="truncate font-medium">{k.label}</p>
                           <p className="text-xs text-muted-foreground">
                              <code className="font-mono">{k.prefix}…</code> ·{' '}
                              {k.revoked_at
                                 ? `revoked ${ago(k.revoked_at)}`
                                 : k.last_used_at
                                   ? `last used ${ago(k.last_used_at)}`
                                   : 'never used'}
                           </p>
                        </div>
                        {!k.revoked_at && (
                           <Button size="sm" variant="ghost" onClick={() => revokeKey(k)}>
                              Revoke
                           </Button>
                        )}
                     </li>
                  ))}
               </ul>
               <DialogFooter>
                  <Button onClick={createKey}>Create key</Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Delete “{toDelete?.title}”?</DialogTitle>
               </DialogHeader>
               <p className="text-sm text-muted-foreground">
                  {toDelete?.live
                     ? 'This article is live: the bots will stop answering from it.'
                     : 'This draft will be removed.'}
               </p>
               <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setToDelete(null)}>
                     Cancel
                  </Button>
                  <Button variant="destructive" onClick={() => toDelete && remove(toDelete)}>
                     Delete
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
