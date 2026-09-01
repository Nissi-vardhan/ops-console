'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Pin, Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Doc {
   id: string;
   title: string;
   body: string;
   category: string;
   pinned: boolean;
   updated_at: string;
}

const PROSE =
   'text-sm leading-relaxed text-foreground/90 ' +
   '[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold ' +
   '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:border-l-2 [&_h2]:border-primary [&_h2]:pl-2.5 ' +
   '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold ' +
   '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 ' +
   '[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold ' +
   '[&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] ' +
   '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre>code]:bg-transparent [&_pre>code]:p-0 ' +
   '[&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground ' +
   '[&_table]:my-3 [&_table]:w-full [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 ' +
   '[&_hr]:my-4 [&_hr]:border-border';

export function DocsView() {
   const [docs, setDocs] = useState<Doc[]>([]);
   const [selId, setSelId] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState<{ title: string; category: string; body: string }>({
      title: '',
      category: 'Doc',
      body: '',
   });

   const load = useCallback(async (keep?: string) => {
      const d = await fetch('/api/ops/docs', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      const list: Doc[] = d?.docs ?? [];
      setDocs(list);
      setSelId((cur) => keep ?? cur ?? list[0]?.id ?? null);
      setLoading(false);
   }, []);
   useEffect(() => {
      load();
   }, [load]);

   const selected = useMemo(() => docs.find((x) => x.id === selId) ?? null, [docs, selId]);

   const startNew = () => {
      setDraft({ title: '', category: 'Doc', body: '' });
      setSelId(null);
      setEditing(true);
   };
   const startEdit = () => {
      if (selected) {
         setDraft({ title: selected.title, category: selected.category, body: selected.body });
         setEditing(true);
      }
   };

   const save = async () => {
      if (!draft.title.trim()) return;
      if (selId) {
         const r = await fetch(`/api/ops/docs/${selId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
         });
         if (r.ok) {
            setEditing(false);
            await load(selId);
         }
      } else {
         const r = await fetch('/api/ops/docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
         });
         const j = await r.json().catch(() => null);
         if (r.ok && j?.doc) {
            setEditing(false);
            await load(j.doc.id);
         }
      }
   };
   const del = async () => {
      if (!selId || !confirm('Delete this doc?')) return;
      await fetch(`/api/ops/docs/${selId}`, { method: 'DELETE' });
      setSelId(null);
      setEditing(false);
      await load();
   };
   const togglePin = async () => {
      if (!selected) return;
      await fetch(`/api/ops/docs/${selected.id}`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ pinned: !selected.pinned }),
      });
      await load(selected.id);
   };

   const grouped = useMemo(() => {
      const g: Record<string, Doc[]> = {};
      for (const d of docs) (g[d.category || 'Doc'] ??= []).push(d);
      return Object.entries(g);
   }, [docs]);

   return (
      <div className="flex h-full w-full overflow-hidden">
         {/* list */}
         <div className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r sm:flex">
            <div className="flex items-center justify-between px-3 py-2.5">
               <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Docs
               </span>
               <Button size="xs" variant="ghost" onClick={startNew}>
                  <Plus className="size-4" />
               </Button>
            </div>
            {grouped.map(([cat, list]) => (
               <div key={cat} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                     {cat}
                  </div>
                  {list.map((d) => (
                     <button
                        key={d.id}
                        onClick={() => {
                           setSelId(d.id);
                           setEditing(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 ${selId === d.id && !editing ? 'bg-muted/60' : ''}`}
                     >
                        {d.pinned ? (
                           <Pin className="size-3.5 shrink-0 text-primary" />
                        ) : (
                           <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{d.title}</span>
                     </button>
                  ))}
               </div>
            ))}
            {!loading && docs.length === 0 && (
               <p className="px-3 py-2 text-xs text-muted-foreground">No docs yet.</p>
            )}
         </div>

         {/* detail / editor */}
         <div className="flex-1 overflow-y-auto">
            {editing ? (
               <div className="mx-auto w-full max-w-3xl space-y-3 p-4 sm:p-6">
                  <input
                     value={draft.title}
                     onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                     placeholder="Doc title"
                     autoFocus
                     className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground"
                  />
                  <input
                     value={draft.category}
                     onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                     placeholder="Category (e.g. Runbook, Reference)"
                     className="w-56 rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus:border-primary"
                  />
                  <textarea
                     value={draft.body}
                     onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                     placeholder="Write in Markdown…  # Heading, **bold**, - lists, ```code```"
                     className="min-h-[50vh] w-full resize-y rounded-lg border bg-container p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-primary"
                  />
                  <div className="flex items-center gap-2">
                     <Button size="sm" onClick={save} disabled={!draft.title.trim()}>
                        <Save className="mr-1 size-4" /> Save
                     </Button>
                     <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                           setEditing(false);
                           if (!selId && docs[0]) setSelId(docs[0].id);
                        }}
                     >
                        <X className="mr-1 size-4" /> Cancel
                     </Button>
                  </div>
               </div>
            ) : selected ? (
               <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                     <div>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                           {selected.category}
                        </span>
                        <h1 className="mt-1.5 text-2xl font-semibold">{selected.title}</h1>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                           updated {new Date(selected.updated_at).toLocaleString()}
                        </p>
                     </div>
                     <div className="flex shrink-0 items-center gap-1">
                        <Button
                           size="xs"
                           variant="ghost"
                           onClick={togglePin}
                           title={selected.pinned ? 'Unpin' : 'Pin'}
                        >
                           <Pin className={`size-4 ${selected.pinned ? 'text-primary' : ''}`} />
                        </Button>
                        <Button size="xs" variant="ghost" onClick={startEdit}>
                           <Pencil className="size-4" />
                        </Button>
                        <Button size="xs" variant="ghost" onClick={del}>
                           <Trash2 className="size-4 text-red-400" />
                        </Button>
                     </div>
                  </div>
                  {selected.body.trim() ? (
                     <div className={PROSE}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.body}</ReactMarkdown>
                     </div>
                  ) : (
                     <p className="text-sm text-muted-foreground">
                        This doc is empty.{' '}
                        <button className="text-primary underline" onClick={startEdit}>
                           Add content
                        </button>
                        .
                     </p>
                  )}
               </div>
            ) : (
               <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <FileText className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                     Document your ops work — runbooks, references, decisions.
                  </p>
                  <Button size="sm" onClick={startNew}>
                     <Plus className="mr-1 size-4" /> New doc
                  </Button>
               </div>
            )}
         </div>
      </div>
   );
}
