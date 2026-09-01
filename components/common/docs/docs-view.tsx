'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
   Check,
   Copy,
   FileText,
   Hash,
   Pencil,
   Pin,
   Plus,
   Save,
   Search,
   Trash2,
   X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Doc {
   id: string;
   title: string;
   body: string;
   category: string;
   pinned: boolean;
   updated_at: string;
}

/* ------------------------------- helpers -------------------------------- */

const slug = (s: string) =>
   s
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

function nodeText(node: ReactNode): string {
   if (node == null || node === false) return '';
   if (typeof node === 'string' || typeof node === 'number') return String(node);
   if (Array.isArray(node)) return node.map(nodeText).join('');
   if (typeof node === 'object' && 'props' in node) {
      return nodeText((node as { props: { children?: ReactNode } }).props.children);
   }
   return '';
}

interface Heading {
   level: number;
   text: string;
   id: string;
}

/** Pull h2/h3 headings out of the markdown source (ignoring fenced code). */
function outline(body: string): Heading[] {
   const out: Heading[] = [];
   let fenced = false;
   for (const raw of body.split('\n')) {
      const line = raw.trimEnd();
      if (/^\s*```/.test(line)) {
         fenced = !fenced;
         continue;
      }
      if (fenced) continue;
      const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
      if (m) {
         const text = m[2].replace(/[*_`]/g, '').trim();
         out.push({ level: m[1].length, text, id: slug(text) });
      }
   }
   return out;
}

/* Prose styling — tuned for reading: comfortable measure, clear hierarchy. */
const PROSE = [
   'text-[15px] leading-7 text-foreground/90',
   '[&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-[26px] [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:scroll-mt-24',
   '[&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:scroll-mt-24',
   '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:scroll-mt-24',
   '[&_p]:my-3.5',
   '[&_ul]:my-3.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1',
   '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80',
   '[&_strong]:font-semibold [&_strong]:text-foreground',
   '[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[13px]',
   '[&_blockquote]:my-4 [&_blockquote]:rounded-r-md [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:bg-muted/30 [&_blockquote]:py-1 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
   '[&_table]:my-4 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-sm [&_thead]:border-b [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:px-3 [&_td]:py-2 [&_tr]:border-b [&_tr]:border-border/60',
   '[&_hr]:my-8 [&_hr]:border-border',
   '[&_img]:my-4 [&_img]:rounded-lg [&_img]:border',
].join(' ');

/** Fenced code block with a copy button + language tag. */
function CodeBlock({ children }: { children?: ReactNode }) {
   const [copied, setCopied] = useState(false);
   const raw = nodeText(children).replace(/\n$/, '');
   const child = Array.isArray(children) ? children[0] : children;
   const className =
      child && typeof child === 'object' && 'props' in child
         ? String((child as { props?: { className?: string } }).props?.className ?? '')
         : '';
   const lang = /language-(\w+)/.exec(className)?.[1] ?? '';
   const copy = async () => {
      try {
         await navigator.clipboard.writeText(raw);
         setCopied(true);
         setTimeout(() => setCopied(false), 1200);
      } catch {
         /* clipboard blocked */
      }
   };
   return (
      <div className="group relative my-4">
         {lang && (
            <span className="absolute left-3 top-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
               {lang}
            </span>
         )}
         <button
            type="button"
            onClick={copy}
            aria-label="Copy code"
            className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md border bg-background/80 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
         >
            {copied ? (
               <Check className="size-3.5 text-emerald-500" />
            ) : (
               <Copy className="size-3.5" />
            )}
         </button>
         <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3.5 pt-7 font-mono text-[12.5px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0">
            {children}
         </pre>
      </div>
   );
}

const MD: Components = {
   h1: ({ children }) => <h1 id={slug(nodeText(children))}>{children}</h1>,
   h2: ({ children }) => <h2 id={slug(nodeText(children))}>{children}</h2>,
   h3: ({ children }) => <h3 id={slug(nodeText(children))}>{children}</h3>,
   a: ({ href, children }) => (
      <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
         {children}
      </a>
   ),
   pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
};

/* -------------------------------- view ---------------------------------- */

export function DocsView() {
   const [docs, setDocs] = useState<Doc[]>([]);
   const [selId, setSelId] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
   const [filter, setFilter] = useState('');
   const [editing, setEditing] = useState(false);
   const [activeH, setActiveH] = useState<string>('');
   const [draft, setDraft] = useState<{ title: string; category: string; body: string }>({
      title: '',
      category: 'Doc',
      body: '',
   });
   const scrollRef = useRef<HTMLDivElement>(null);
   const articleRef = useRef<HTMLElement>(null);

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
   const toc = useMemo(() => (selected ? outline(selected.body) : []), [selected]);
   const readMins = useMemo(
      () => (selected ? Math.max(1, Math.round(selected.body.split(/\s+/).length / 200)) : 0),
      [selected]
   );

   // Scroll-spy: highlight the heading nearest the top of the reading pane.
   useEffect(() => {
      setActiveH('');
      const root = scrollRef.current;
      const article = articleRef.current;
      if (!root || !article || toc.length === 0) return;
      const headings = Array.from(article.querySelectorAll<HTMLElement>('h2[id], h3[id]'));
      if (headings.length === 0) return;
      const obs = new IntersectionObserver(
         (entries) => {
            const visible = entries.filter((e) => e.isIntersecting);
            if (visible.length > 0) {
               const top = visible.reduce((a, b) =>
                  a.boundingClientRect.top < b.boundingClientRect.top ? a : b
               );
               setActiveH(top.target.id);
            }
         },
         { root, rootMargin: '0px 0px -70% 0px', threshold: 0 }
      );
      headings.forEach((h) => obs.observe(h));
      return () => obs.disconnect();
   }, [toc, selId]);

   const jumpTo = (id: string) => {
      const el = articleRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (el) {
         el.scrollIntoView({ behavior: 'smooth', block: 'start' });
         setActiveH(id);
      }
   };

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
      const q = filter.trim().toLowerCase();
      const g: Record<string, Doc[]> = {};
      for (const d of docs) {
         if (q && !`${d.title} ${d.category}`.toLowerCase().includes(q)) continue;
         (g[d.category || 'Doc'] ??= []).push(d);
      }
      return Object.entries(g);
   }, [docs, filter]);

   return (
      <div className="flex h-full w-full overflow-hidden">
         {/* doc list */}
         <aside className="hidden w-64 shrink-0 flex-col border-r sm:flex">
            <div className="flex items-center justify-between px-3 pt-3">
               <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Docs
               </span>
               <Button size="xs" variant="ghost" onClick={startNew} title="New doc">
                  <Plus className="size-4" />
               </Button>
            </div>
            <div className="px-3 py-2">
               <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                     value={filter}
                     onChange={(e) => setFilter(e.target.value)}
                     placeholder="Filter docs…"
                     className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:border-primary"
                  />
               </div>
            </div>
            <div className="flex-1 overflow-y-auto pb-4">
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
                           className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                              selId === d.id && !editing
                                 ? 'bg-muted/60 font-medium text-foreground'
                                 : 'text-foreground/80'
                           }`}
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
               {!loading && grouped.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                     {filter ? 'No docs match.' : 'No docs yet.'}
                  </p>
               )}
            </div>
         </aside>

         {/* reading pane */}
         <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
                     className="min-h-[55vh] w-full resize-y rounded-lg border bg-container p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-primary"
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
               <div className="mx-auto flex w-full max-w-[920px] gap-10 px-6 py-8 lg:px-10">
                  <article ref={articleRef} className="min-w-0 flex-1">
                     <div className="mb-6 border-b pb-5">
                        <div className="flex items-start justify-between gap-3">
                           <div className="min-w-0">
                              <span className="inline-flex items-center rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                                 {selected.category}
                              </span>
                              <h1 className="mt-2.5 text-[28px] font-semibold leading-tight tracking-tight">
                                 {selected.title}
                              </h1>
                              <p className="mt-2 text-xs text-muted-foreground">
                                 Updated{' '}
                                 {new Date(selected.updated_at).toLocaleDateString(undefined, {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                 })}
                                 {' · '}
                                 {readMins} min read
                              </p>
                           </div>
                           <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 onClick={togglePin}
                                 title={selected.pinned ? 'Unpin' : 'Pin'}
                              >
                                 <Pin
                                    className={`size-4 ${selected.pinned ? 'fill-primary text-primary' : ''}`}
                                 />
                              </Button>
                              <Button size="xs" variant="ghost" onClick={startEdit} title="Edit">
                                 <Pencil className="size-4" />
                              </Button>
                              <Button size="xs" variant="ghost" onClick={del} title="Delete">
                                 <Trash2 className="size-4 text-red-400" />
                              </Button>
                           </div>
                        </div>
                     </div>

                     {selected.body.trim() ? (
                        <div className={PROSE}>
                           <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                              {selected.body}
                           </ReactMarkdown>
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
                  </article>

                  {toc.length > 0 && (
                     <aside className="sticky top-0 hidden h-max w-52 shrink-0 pt-1 xl:block">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                           <Hash className="size-3" /> On this page
                        </p>
                        <nav className="border-l border-border">
                           {toc.map((h) => (
                              <button
                                 key={h.id}
                                 onClick={() => jumpTo(h.id)}
                                 className={`-ml-px block w-full border-l py-1 text-left text-xs leading-snug transition-colors ${
                                    h.level === 3 ? 'pl-6' : 'pl-3'
                                 } ${
                                    activeH === h.id
                                       ? 'border-primary font-medium text-foreground'
                                       : 'border-transparent text-muted-foreground hover:text-foreground'
                                 }`}
                              >
                                 {h.text}
                              </button>
                           ))}
                        </nav>
                     </aside>
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
