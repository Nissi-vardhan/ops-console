'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';

/** Manage a doc's Google-gated share link: allow-list + link + copy/remove. */
export function ShareDialog({
   docId,
   open,
   onOpenChange,
}: {
   docId: string;
   open: boolean;
   onOpenChange: (o: boolean) => void;
}) {
   const [emails, setEmails] = useState('');
   const [token, setToken] = useState<string | null>(null);
   const [googleOk, setGoogleOk] = useState(true);
   const [busy, setBusy] = useState(false);
   const [copied, setCopied] = useState(false);

   useEffect(() => {
      if (!open) return;
      setCopied(false);
      fetch(`/api/ops/docs/${docId}/share`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!d) return;
            setGoogleOk(!!d.googleConfigured);
            if (d.share) {
               setToken(d.share.token);
               setEmails((d.share.allowed_emails ?? []).join(', '));
            } else {
               setToken(null);
               setEmails('');
            }
         })
         .catch(() => {});
   }, [open, docId]);

   const url =
      token && typeof window !== 'undefined' ? `${window.location.origin}/share/${token}` : '';
   const parseEmails = () =>
      emails
         .split(/[\s,;]+/)
         .map((s) => s.trim())
         .filter(Boolean);

   const create = async () => {
      setBusy(true);
      const r = await fetch(`/api/ops/docs/${docId}/share`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ allowed_emails: parseEmails() }),
      });
      const d = await r.json().catch(() => null);
      if (d?.share) setToken(d.share.token);
      setBusy(false);
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

            <div className="space-y-1.5">
               <label className="text-xs font-medium text-muted-foreground">
                  Allowed Google accounts
               </label>
               <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  rows={3}
                  placeholder="arun@shortcastle.com, someone@gmail.com"
                  className="w-full rounded-md border bg-background p-2 text-sm outline-none focus:border-primary"
               />
               <p className="text-[11px] text-muted-foreground">
                  Separate with commas. Only these accounts will be let in.
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
                     <Button size="sm" onClick={create} disabled={busy}>
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
               <Button size="sm" onClick={create} disabled={busy}>
                  <Link2 className="mr-1 size-4" /> Create share link
               </Button>
            )}
         </DialogContent>
      </Dialog>
   );
}
