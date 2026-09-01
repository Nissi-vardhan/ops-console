'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';

interface Comment {
   id: string;
   author_name: string;
   author_email: string;
   body: string;
   created_at: string;
}

/** A feedback thread. `listUrl` GETs {comments}; `postUrl` POSTs {...extra, body}.
 *  Each comment shows the author's name + timestamp. Reusable for docs, the
 *  public share page, and tasks. */
export function Comments({
   listUrl,
   postUrl,
   extra,
}: {
   listUrl: string;
   postUrl?: string;
   extra?: Record<string, unknown>;
}) {
   const [items, setItems] = useState<Comment[]>([]);
   const [text, setText] = useState('');
   const [busy, setBusy] = useState(false);
   const [loaded, setLoaded] = useState(false);

   const load = useCallback(() => {
      fetch(listUrl, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (d?.comments) setItems(d.comments);
            setLoaded(true);
         })
         .catch(() => setLoaded(true));
   }, [listUrl]);
   useEffect(() => {
      load();
   }, [load]);

   const submit = async () => {
      if (!text.trim() || !postUrl) return;
      setBusy(true);
      const r = await fetch(postUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ ...(extra ?? {}), body: text.trim() }),
      });
      if (r.ok) {
         setText('');
         load();
      }
      setBusy(false);
   };

   const fmt = (s: string) => {
      try {
         return new Date(s).toLocaleString(undefined, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
         });
      } catch {
         return s;
      }
   };
   const initials = (n: string) => (n || '?').slice(0, 2).toUpperCase();

   return (
      <section className="mt-10 border-t pt-6">
         <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="size-4" /> Comments
            {items.length > 0 && (
               <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                  {items.length}
               </span>
            )}
         </h2>

         <div className="space-y-3.5">
            {items.map((c) => (
               <div key={c.id} className="flex gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                     {initials(c.author_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                     <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">
                           {c.author_name || c.author_email || 'Someone'}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                           {fmt(c.created_at)}
                        </span>
                     </div>
                     <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                        {c.body}
                     </p>
                  </div>
               </div>
            ))}
            {loaded && items.length === 0 && (
               <p className="text-xs text-muted-foreground">No comments yet — be the first.</p>
            )}
         </div>

         {postUrl && (
            <div className="mt-4 flex items-start gap-2">
               <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  placeholder="Add a comment or requested change…  (⌘/Ctrl + Enter to post)"
                  className="min-w-0 flex-1 rounded-lg border bg-background p-2.5 text-sm outline-none focus:border-primary"
                  onKeyDown={(e) => {
                     if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
                  }}
               />
               <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !text.trim()}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
               >
                  <Send className="size-4" /> Post
               </button>
            </div>
         )}
      </section>
   );
}
