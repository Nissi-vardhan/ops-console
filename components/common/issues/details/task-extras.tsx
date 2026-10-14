'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Task page extras: files attached to the task (e.g. the brief PDF, or an
// intern's closing report) and the intern's own updates (start / progress /
// stuck / submitted), all times in IST.

const ist = (v: string) =>
   new Date(v).toLocaleString('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
   });
const kb = (n: number) =>
   n > 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

interface Att {
   id: string;
   filename: string;
   size: number;
   intern_id: string | null;
   created_at: string;
}

export function TaskFiles({ issueRef }: { issueRef: string }) {
   const [files, setFiles] = useState<Att[] | null>(null);
   const [canUpload, setCanUpload] = useState(false);
   const [busy, setBusy] = useState(false);
   const input = useRef<HTMLInputElement>(null);

   const load = useCallback(async () => {
      const r = await fetch(`/api/ops/attachments?issue=${encodeURIComponent(issueRef)}`, {
         cache: 'no-store',
      }).catch(() => null);
      const d = r?.ok ? await r.json() : null;
      setFiles(d?.attachments ?? []);
      setCanUpload(!!d?.storageConfigured);
   }, [issueRef]);
   useEffect(() => {
      load();
   }, [load]);

   const upload = async (file: File) => {
      setBusy(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('issue_id', issueRef);
      const r = await fetch('/api/ops/attachments', { method: 'POST', body: fd }).catch(() => null);
      setBusy(false);
      if (!r?.ok) {
         const e = await r?.json().catch(() => null);
         toast.error(e?.error || 'Upload failed');
         return;
      }
      toast.success('File attached');
      load();
   };

   if (files === null) return null;
   return (
      <div className="mt-8">
         <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
               Files
            </h2>
            {canUpload && (
               <>
                  <input
                     ref={input}
                     type="file"
                     className="hidden"
                     accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.txt,.csv"
                     onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(f);
                        e.target.value = '';
                     }}
                  />
                  <Button
                     size="sm"
                     variant="outline"
                     disabled={busy}
                     onClick={() => input.current?.click()}
                  >
                     <Paperclip className="size-3.5" /> {busy ? 'Uploading…' : 'Attach file'}
                  </Button>
               </>
            )}
         </div>
         {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">No files.</p>
         ) : (
            <ul className="divide-y rounded-xl border bg-container">
               {files.map((f) => (
                  <li key={f.id}>
                     <a
                        href={`/api/ops/attachments/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-10 items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                     >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{f.filename}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                           {f.intern_id ? 'from intern · ' : ''}
                           {kb(Number(f.size))} · {ist(f.created_at)}
                        </span>
                     </a>
                  </li>
               ))}
            </ul>
         )}
      </div>
   );
}

const KIND: Record<string, { label: string; cls: string }> = {
   start: { label: 'Started', cls: 'text-sky-600 dark:text-sky-400' },
   progress: { label: 'Progress', cls: 'text-muted-foreground' },
   stuck: { label: 'Stuck', cls: 'text-red-600 dark:text-red-400' },
   unstuck: { label: 'Resumed', cls: 'text-sky-600 dark:text-sky-400' },
   close: { label: 'Submitted for review', cls: 'text-emerald-600 dark:text-emerald-400' },
};

export function InternUpdates({ issueRef }: { issueRef: string }) {
   const [updates, setUpdates] = useState<
      { kind: string; text: string; at: string; intern: string }[] | null
   >(null);
   useEffect(() => {
      fetch(`/api/ops/issues/${encodeURIComponent(issueRef)}/intern-updates`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setUpdates(d?.updates ?? []))
         .catch(() => setUpdates([]));
   }, [issueRef]);
   if (!updates?.length) return null;
   return (
      <div className="mt-8">
         <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Intern updates · {updates[0].intern}
         </h2>
         <ol className="space-y-2.5 border-l pl-4">
            {updates.map((u, i) => (
               <li key={i} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                     <span className="tabular-nums text-muted-foreground">{ist(u.at)} IST</span>
                     <span className={`font-medium ${KIND[u.kind]?.cls ?? ''}`}>
                        {KIND[u.kind]?.label ?? u.kind}
                     </span>
                  </div>
                  {u.text && (
                     <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                        {u.text}
                     </p>
                  )}
               </li>
            ))}
         </ol>
      </div>
   );
}
