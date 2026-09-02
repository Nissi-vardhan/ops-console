'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Copy, Link2, Trash2, X, UserPlus } from 'lucide-react';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Manage a doc's Google-gated share link: allow-list (as chips) + link + copy/remove. */
export function ShareDialog({
   docId,
   open,
   onOpenChange,
}: {
   docId: string;
   open: boolean;
   onOpenChange: (o: boolean) => void;
}) {
   const [emails, setEmails] = useState<string[]>([]);
   const [input, setInput] = useState('');
   const [token, setToken] = useState<string | null>(null);
   const [googleOk, setGoogleOk] = useState(true);
   const [busy, setBusy] = useState(false);
   const [copied, setCopied] = useState(false);

   useEffect(() => {
      if (!open) return;
      setCopied(false);
      setInput('');
      fetch(`/api/ops/docs/${docId}/share`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!d) return;
            setGoogleOk(!!d.googleConfigured);
            setToken(d.share?.token ?? null);
            setEmails(d.share?.allowed_emails ?? []);
         })
         .catch(() => {});
   }, [open, docId]);

   const url =
      token && typeof window !== 'undefined' ? `${window.location.origin}/share/${token}` : '';

   // Absorb whatever's typed (one email, or a pasted comma/space-separated list).
   const commit = (raw: string) => {
      const parts = raw
         .split(/[\s,;]+/)
         .map((s) => s.trim().toLowerCase())
         .filter(Boolean);
      if (parts.length === 0) return;
      setEmails((prev) => Array.from(new Set([...prev, ...parts.filter((p) => EMAIL_RE.test(p))])));
      setInput('');
   };
   const removeEmail = (e: string) => setEmails((prev) => prev.filter((x) => x !== e));

   const inputValid = EMAIL_RE.test(input.trim());

   const persist = async (list: string[]) => {
      setBusy(true);
      const r = await fetch(`/api/ops/docs/${docId}/share`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ allowed_emails: list }),
      });
      const d = await r.json().catch(() => null);
      if (d?.share) {
         setToken(d.share.token);
         setEmails(d.share.allowed_emails ?? list);
      }
      setBusy(false);
   };
   // Fold any half-typed email in before saving, so a lone entry isn't lost.
   const save = async () => {
      const pending = input.trim().toLowerCase();
      const list =
         pending && EMAIL_RE.test(pending) ? Array.from(new Set([...emails, pending])) : emails;
      setInput('');
      await persist(list);
   };
   const remove = async () => {
      setBusy(true);
      await fetch(`/api/ops/docs/${docId}/share`, { method: 'DELETE' });
      setToken(null);
      setBusy(false);
   };
   const copy = async () => {
      try {
         await navigator.clipboard.writeText(url);
         setCopied(true);
         setTimeout(() => setCopied(false), 1200);
      } catch {
         /* clipboard blocked */
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
            <DialogTitle>Share this doc</DialogTitle>
            <DialogDescription>
               Anyone signed in with an allowed Google account can read it.
            </DialogDescription>

            {!googleOk && (
               <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                  Google sign-in isn’t configured yet, so share links won’t open. Set{' '}
                  <span className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</span>.
               </p>
            )}

            <div className="space-y-2">
               <label className="text-xs font-medium text-muted-foreground">Add people</label>
               <div className="flex items-center gap-2">
                  <input
                     value={input}
                     onChange={(e) => setInput(e.target.value)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                           e.preventDefault();
                           commit(input);
                        } else if (e.key === 'Backspace' && !input && emails.length) {
                           removeEmail(emails[emails.length - 1]);
                        }
                     }}
                     onBlur={() => input.trim() && commit(input)}
                     type="email"
                     placeholder="name@shortcastle.com"
                     className="w-full rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary"
                  />
                  <Button
                     size="sm"
                     variant="secondary"
                     disabled={!inputValid}
                     onClick={() => commit(input)}
                  >
                     <UserPlus className="mr-1 size-4" /> Add
                  </Button>
               </div>

               {/* Who has access */}
               <div className="rounded-md border bg-muted/20 p-2">
                  <p className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                     Who has access ({emails.length})
                  </p>
                  {emails.length === 0 ? (
                     <p className="px-0.5 py-1 text-xs text-muted-foreground">
                        No one yet — add the Google accounts that may read this doc.
                     </p>
                  ) : (
                     <ul className="flex flex-wrap gap-1.5">
                        {emails.map((e) => (
                           <li
                              key={e}
                              className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-xs"
                           >
                              <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold uppercase text-primary">
                                 {e[0]}
                              </span>
                              <span className="max-w-[180px] truncate">{e}</span>
                              <button
                                 onClick={() => removeEmail(e)}
                                 aria-label={`Remove ${e}`}
                                 className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                 <X className="size-3" />
                              </button>
                           </li>
                        ))}
                     </ul>
                  )}
               </div>
               <p className="text-[11px] text-muted-foreground">
                  Only these Google accounts will be let in. Changes take effect when you save.
               </p>
            </div>

            {url ? (
               <div className="space-y-2.5">
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2">
                     <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                     <span className="min-w-0 flex-1 truncate text-xs">{url}</span>
                     <button
                        onClick={copy}
                        aria-label="Copy link"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                     >
                        {copied ? (
                           <Check className="size-4 text-emerald-500" />
                        ) : (
                           <Copy className="size-4" />
                        )}
                     </button>
                  </div>
                  <div className="flex items-center gap-2">
                     <Button size="sm" onClick={save} disabled={busy}>
                        Update access
                     </Button>
                     <Button
                        size="sm"
                        variant="ghost"
                        onClick={remove}
                        disabled={busy}
                        className="text-red-400 hover:text-red-400"
                     >
                        <Trash2 className="mr-1 size-4" /> Remove link
                     </Button>
                  </div>
               </div>
            ) : (
               <Button size="sm" onClick={save} disabled={busy}>
                  <Link2 className="mr-1 size-4" /> Create share link
               </Button>
            )}
         </DialogContent>
      </Dialog>
   );
}
