'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { DocMarkdown } from '@/components/common/docs/doc-render';
import { DocReview } from '@/components/common/docs/doc-review';
import { Comments } from '@/components/common/comments';
import { CastleMark } from '@/components/brand/castle-mark';

interface GsiId {
   initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
   renderButton: (el: HTMLElement, opts: Record<string, string>) => void;
}
declare global {
   interface Window {
      google?: { accounts?: { id?: GsiId } };
   }
}

interface Doc {
   title: string;
   body: string;
   category: string;
   updated_at: string;
}
interface State {
   doc?: Doc;
   email?: string;
   needsAuth?: boolean;
   clientId?: string;
   error?: string;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
   const { token } = use(params);
   const [st, setSt] = useState<State | null>(null);
   const [msg, setMsg] = useState('');
   const btnRef = useRef<HTMLDivElement>(null);

   const load = useCallback(async () => {
      const r = await fetch(`/api/share/${token}`, { cache: 'no-store' });
      if (r.status === 404) return setSt({ error: 'This share link is not valid.' });
      const d = await r.json().catch(() => ({ error: 'Could not load this document.' }));
      setSt(d);
   }, [token]);

   useEffect(() => {
      load();
   }, [load]);

   // Mount the Google sign-in button when access is needed.
   useEffect(() => {
      if (!st?.needsAuth || !st.clientId) return;
      let cancelled = false;

      const onCredential = async (resp: { credential: string }) => {
         setMsg('Verifying…');
         const r = await fetch(`/api/share/${token}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: resp.credential }),
         });
         const d = await r.json().catch(() => ({}));
         if (d.ok) {
            setMsg('');
            load();
         } else {
            setMsg(d.error || 'Access denied.');
         }
      };

      const init = () => {
         const id = window.google?.accounts?.id;
         if (!id || cancelled || !st.clientId) return;
         id.initialize({ client_id: st.clientId, callback: onCredential });
         if (btnRef.current) {
            id.renderButton(btnRef.current, {
               theme: 'filled_black',
               size: 'large',
               shape: 'pill',
               text: 'signin_with',
            });
         }
      };

      if (window.google?.accounts?.id) {
         init();
      } else {
         const s = document.createElement('script');
         s.src = 'https://accounts.google.com/gsi/client';
         s.async = true;
         s.defer = true;
         s.onload = init;
         document.head.appendChild(s);
      }
      return () => {
         cancelled = true;
      };
   }, [st?.needsAuth, st?.clientId, token, load]);

   return (
      <div className="min-h-svh bg-background text-foreground">
         <header className="flex h-14 items-center gap-2.5 border-b px-5">
            <CastleMark className="size-7 rounded-md" />
            <span className="text-sm font-semibold">Shortcastle Ops</span>
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
               Shared doc
            </span>
            {st?.email && <span className="ml-auto text-xs text-muted-foreground">{st.email}</span>}
         </header>

         {!st && <p className="p-10 text-sm text-muted-foreground">Loading…</p>}

         {st?.error && (
            <div className="mx-auto max-w-md p-12 text-center">
               <p className="text-sm text-muted-foreground">{st.error}</p>
            </div>
         )}

         {st?.needsAuth && (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-5 px-6 py-24 text-center">
               <CastleMark className="size-12 rounded-xl" />
               <div>
                  <h1 className="text-lg font-semibold">This document is private</h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                     {st.clientId
                        ? 'Sign in with the Google account it was shared with to continue.'
                        : 'Sharing isn’t fully set up yet — ask the ops team to finish the Google configuration.'}
                  </p>
               </div>
               {st.clientId && <div ref={btnRef} />}
               {msg && <p className="text-xs text-destructive">{msg}</p>}
            </div>
         )}

         {st?.doc && (
            <div className="mx-auto w-full max-w-3xl px-5 py-10">
               <span className="inline-flex items-center rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  {st.doc.category}
               </span>
               <h1 className="mt-2.5 text-[28px] font-semibold leading-tight tracking-tight">
                  {st.doc.title}
               </h1>
               <p className="mt-2 border-b pb-5 text-xs text-muted-foreground">
                  Updated{' '}
                  {new Date(st.doc.updated_at).toLocaleDateString(undefined, {
                     day: 'numeric',
                     month: 'short',
                     year: 'numeric',
                  })}
               </p>
               <div className="pt-5">
                  <DocReview baseUrl={`/api/share/${token}/review`} />
               </div>
               <div className="pt-5">
                  <DocMarkdown
                     body={st.doc.body}
                     attachmentBase={`/api/share/${token}/attachments`}
                  />
               </div>
               <Comments
                  listUrl={`/api/share/${token}/comments`}
                  postUrl={`/api/share/${token}/comments`}
               />
            </div>
         )}
      </div>
   );
}
