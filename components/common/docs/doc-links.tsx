'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleDot, FileText, Link2, Plus, X } from 'lucide-react';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';

interface LinkedIssue {
   id: string;
   identifier: string | null;
   title: string;
   status_id: string;
}
interface LinkedDoc {
   id: string;
   title: string;
   category: string;
}

function CardShell({ count, children }: { count: number; children: React.ReactNode }) {
   return (
      <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.04] shadow-sm">
         <div className="flex items-center gap-2 border-b border-border/60 bg-foreground/[0.03] px-3.5 py-2.5">
            <Link2 className="size-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">Linked tasks</h3>
            {count > 0 && (
               <span className="ml-auto text-[11px] text-muted-foreground">{count}</span>
            )}
         </div>
         <div className="p-3.5">{children}</div>
      </div>
   );
}

/** Doc side — tasks linked to this doc (add by OPS-N, remove). */
export function DocLinkedTasks({ docId, base }: { docId: string; base: string }) {
   const [issues, setIssues] = useState<LinkedIssue[]>([]);
   const [input, setInput] = useState('');
   const [busy, setBusy] = useState(false);
   const [err, setErr] = useState<string | null>(null);

   const load = useCallback(async () => {
      const d = await fetch(`/api/ops/docs/${docId}/links`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      setIssues((d?.issues ?? []) as LinkedIssue[]);
   }, [docId]);
   useEffect(() => {
      load();
   }, [load]);

   const add = async () => {
      const issue = input.trim();
      if (!issue) return;
      setBusy(true);
      setErr(null);
      const r = await fetch(`/api/ops/docs/${docId}/links`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ issue }),
      });
      if (r.ok) {
         const d = await r.json();
         setIssues(d.issues ?? []);
         setInput('');
      } else {
         setErr('No task with that ID.');
      }
      setBusy(false);
   };
   const remove = async (identifier: string | null, id: string) => {
      setBusy(true);
      const r = await fetch(`/api/ops/docs/${docId}/links`, {
         method: 'DELETE',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ issue: identifier || id }),
      });
      if (r.ok) setIssues((await r.json()).issues ?? []);
      setBusy(false);
   };

   return (
      <CardShell count={issues.length}>
         {issues.length === 0 ? (
            <p className="mb-2 text-sm text-muted-foreground">No tasks linked yet.</p>
         ) : (
            <ul className="mb-2 space-y-1.5">
               {issues.map((i) => (
                  <li key={i.id} className="group flex items-center gap-2 text-sm">
                     <CircleDot className="size-3.5 shrink-0 text-primary" />
                     <Link
                        href={`${base}/issue/${i.identifier}`}
                        className="min-w-0 flex-1 truncate hover:text-primary"
                     >
                        <span className="font-mono text-xs text-muted-foreground">
                           {i.identifier}
                        </span>{' '}
                        {i.title}
                     </Link>
                     <button
                        onClick={() => remove(i.identifier, i.id)}
                        disabled={busy}
                        aria-label="Unlink"
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                     >
                        <X className="size-3.5" />
                     </button>
                  </li>
               ))}
            </ul>
         )}
         <div className="flex items-center gap-2">
            <input
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && add()}
               placeholder="Link a task — OPS-N"
               className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
               onClick={add}
               disabled={busy || !input.trim()}
               className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-50"
               aria-label="Add link"
            >
               <Plus className="size-4" />
            </button>
         </div>
         {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
      </CardShell>
   );
}

/** Task side — docs linked to this task (add via picker, remove). */
export function TaskLinkedDocs({ issueRef, base }: { issueRef: string; base: string }) {
   const [docs, setDocs] = useState<LinkedDoc[]>([]);
   const [all, setAll] = useState<LinkedDoc[]>([]);
   const [busy, setBusy] = useState(false);

   const load = useCallback(async () => {
      const d = await fetch(`/api/ops/issues/${issueRef}/links`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .catch(() => null);
      setDocs((d?.docs ?? []) as LinkedDoc[]);
   }, [issueRef]);
   useEffect(() => {
      load();
      fetch('/api/ops/docs', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setAll((d?.docs ?? []) as LinkedDoc[]))
         .catch(() => {});
   }, [load]);

   const linkedIds = new Set(docs.map((d) => d.id));
   const options = all.filter((d) => !linkedIds.has(d.id));

   const add = async (docId: string) => {
      setBusy(true);
      const r = await fetch(`/api/ops/issues/${issueRef}/links`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ doc: docId }),
      });
      if (r.ok) setDocs((await r.json()).docs ?? []);
      setBusy(false);
   };
   const remove = async (docId: string) => {
      setBusy(true);
      const r = await fetch(`/api/ops/issues/${issueRef}/links`, {
         method: 'DELETE',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ doc: docId }),
      });
      if (r.ok) setDocs((await r.json()).docs ?? []);
      setBusy(false);
   };

   return (
      <div className="mt-8">
         <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="size-3.5" /> Linked docs
         </h2>
         {docs.length > 0 && (
            <ul className="mb-2 space-y-1.5">
               {docs.map((d) => (
                  <li key={d.id} className="group flex items-center gap-2 text-sm">
                     <FileText className="size-3.5 shrink-0 text-primary" />
                     <Link
                        href={`${base}/docs?doc=${d.id}`}
                        className="min-w-0 flex-1 truncate hover:text-primary"
                     >
                        {d.title}
                        <span className="ml-2 text-xs text-muted-foreground">{d.category}</span>
                     </Link>
                     <button
                        onClick={() => remove(d.id)}
                        disabled={busy}
                        aria-label="Unlink"
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                     >
                        <X className="size-3.5" />
                     </button>
                  </li>
               ))}
            </ul>
         )}
         {options.length > 0 ? (
            <Select value="" onValueChange={(v) => v && add(v)} disabled={busy}>
               <SelectTrigger className="h-8 w-full max-w-xs">
                  <SelectValue placeholder="Link a doc…" />
               </SelectTrigger>
               <SelectContent>
                  {options.map((d) => (
                     <SelectItem key={d.id} value={d.id}>
                        {d.title}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
         ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No docs to link.</p>
         ) : null}
      </div>
   );
}
