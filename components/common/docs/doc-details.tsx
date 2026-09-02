'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Info, Paperclip, Users, Pin } from 'lucide-react';

interface DocMeta {
   id: string;
   category: string;
   review_stage?: string | null;
   created_at?: string;
   created_by?: string | null;
   updated_at: string;
   pinned?: boolean;
}

interface Attachment {
   id: string;
   filename: string;
   size: number;
}

const STAGE_LABEL: Record<string, string> = {
   review: 'In review',
   changes: 'Changes requested',
   approved: 'Approved',
};
const STAGE_CLS: Record<string, string> = {
   review: 'text-amber-500',
   changes: 'text-red-500',
   approved: 'text-emerald-500',
};

function fmtDate(iso?: string): string {
   if (!iso) return '—';
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
function fmtSize(n: number): string {
   if (n < 1024) return `${n} B`;
   if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
   return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** A titled rail card matching the Review panel's box style. */
function Card({
   title,
   icon: Icon,
   count,
   children,
}: {
   title: string;
   icon: typeof Info;
   count?: ReactNode;
   children: ReactNode;
}) {
   return (
      <div className="overflow-hidden rounded-xl border border-border bg-foreground/[0.04] shadow-sm">
         <div className="flex items-center gap-2 border-b border-border/60 bg-foreground/[0.03] px-3.5 py-2.5">
            <Icon className="size-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {count != null && (
               <span className="ml-auto text-[11px] text-muted-foreground">{count}</span>
            )}
         </div>
         <div className="p-3.5">{children}</div>
      </div>
   );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
   return (
      <div className="flex items-start justify-between gap-3 py-1 text-sm">
         <span className="shrink-0 text-muted-foreground">{label}</span>
         <span className="min-w-0 truncate text-right font-medium">{children}</span>
      </div>
   );
}

/**
 * Right-rail metadata for a doc — Details / Attachments / Access — styled after a
 * "case detail" side panel but in the ops dark theme.
 */
export function DocDetails({ doc, readMins }: { doc: DocMeta; readMins: number }) {
   const [author, setAuthor] = useState<string | null>(null);
   const [emails, setEmails] = useState<string[]>([]);
   const [attachments, setAttachments] = useState<Attachment[]>([]);

   // Resolve the author name from the members list.
   useEffect(() => {
      if (!doc.created_by) {
         setAuthor(null);
         return;
      }
      let live = true;
      fetch('/api/ops/members', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!live) return;
            const m = (d?.members ?? []).find((x: { id: string }) => x.id === doc.created_by);
            setAuthor(m?.username ?? null);
         })
         .catch(() => {});
      return () => {
         live = false;
      };
   }, [doc.created_by]);

   useEffect(() => {
      let live = true;
      fetch(`/api/ops/docs/${doc.id}/share`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => live && setEmails(d?.share?.allowed_emails ?? []))
         .catch(() => {});
      fetch(`/api/ops/attachments?doc=${doc.id}`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => live && setAttachments((d?.attachments ?? []) as Attachment[]))
         .catch(() => {});
      return () => {
         live = false;
      };
   }, [doc.id]);

   const stage = doc.review_stage;

   return (
      <>
         <Card title="Details" icon={Info}>
            <div className="-my-0.5">
               <Row label="Category">{doc.category}</Row>
               <Row label="Status">
                  {stage ? (
                     <span className={STAGE_CLS[stage] ?? ''}>{STAGE_LABEL[stage] ?? stage}</span>
                  ) : (
                     <span className="text-muted-foreground">Not in review</span>
                  )}
               </Row>
               <Row label="Created">{fmtDate(doc.created_at)}</Row>
               <Row label="Updated">{fmtDate(doc.updated_at)}</Row>
               {author && <Row label="Author">{author}</Row>}
               <Row label="Read time">{readMins} min</Row>
               {doc.pinned && (
                  <Row label="Pinned">
                     <span className="inline-flex items-center gap-1 text-primary">
                        <Pin className="size-3 fill-primary" /> Yes
                     </span>
                  </Row>
               )}
            </div>
         </Card>

         <Card title="Attachments" icon={Paperclip} count={attachments.length || undefined}>
            {attachments.length === 0 ? (
               <p className="text-sm text-muted-foreground">No files attached.</p>
            ) : (
               <ul className="space-y-1.5">
                  {attachments.map((a) => (
                     <li key={a.id} className="flex items-center gap-2 text-sm">
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                           {fmtSize(a.size)}
                        </span>
                     </li>
                  ))}
               </ul>
            )}
         </Card>

         <Card title="Access" icon={Users} count={emails.length || undefined}>
            {emails.length === 0 ? (
               <p className="text-sm text-muted-foreground">Private — not shared.</p>
            ) : (
               <ul className="space-y-1.5">
                  {emails.map((e) => (
                     <li key={e} className="flex items-center gap-2 text-sm">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold uppercase text-primary">
                           {e[0]}
                        </span>
                        <span className="min-w-0 truncate">{e}</span>
                     </li>
                  ))}
               </ul>
            )}
         </Card>
      </>
   );
}
