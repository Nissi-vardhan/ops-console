'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { CastleMark, Crenellation } from '@/components/brand/castle-mark';
import { easeOut } from '@/components/motion';

interface GsiId {
   initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
   renderButton: (el: HTMLElement, opts: Record<string, string>) => void;
}
declare global {
   interface Window {
      google?: { accounts?: { id?: GsiId } };
   }
}

export default function OpsLogin() {
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [busy, setBusy] = useState(false);
   const [err, setErr] = useState<string | null>(null);
   const [clientId, setClientId] = useState<string | null>(null);
   const [gmsg, setGmsg] = useState<string | null>(null);
   const gbtn = useRef<HTMLDivElement>(null);

   // Ask the server whether Google sign-in is available (and for the client id).
   useEffect(() => {
      fetch('/api/auth/google', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setClientId(d?.clientId ?? null))
         .catch(() => setClientId(null));
   }, []);

   // Boot the Google Identity Services button once we have a client id.
   useEffect(() => {
      if (!clientId) return;
      let cancelled = false;

      const onCredential = async (resp: { credential: string }) => {
         setGmsg('Verifying…');
         const r = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: resp.credential }),
         });
         if (r.ok) {
            window.location.href = '/';
            return;
         }
         const d = await r.json().catch(() => ({}));
         setGmsg(d.error || "That account can't access ops.");
      };

      const init = () => {
         const id = window.google?.accounts?.id;
         if (!id || cancelled) return;
         id.initialize({ client_id: clientId, callback: onCredential });
         if (gbtn.current) {
            id.renderButton(gbtn.current, {
               theme: 'filled_black',
               size: 'large',
               shape: 'pill',
               text: 'continue_with',
               width: '288',
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
   }, [clientId]);

   const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      const r = await fetch('/api/auth', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email, password }),
      });
      if (r.ok) {
         window.location.href = '/';
         return;
      }
      const d = await r.json().catch(() => ({}));
      setErr(d.error || "That email and password didn't match. Try again.");
      setBusy(false);
   };

   const reduce = useReducedMotion();
   const rise: Variants | undefined = reduce
      ? undefined
      : {
           hidden: { opacity: 0, y: 14 },
           show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
        };
   const mark: Variants | undefined = reduce
      ? undefined
      : {
           hidden: { opacity: 0, scale: 0.6, y: -6 },
           show: {
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { type: 'spring', stiffness: 260, damping: 18 },
           },
        };

   return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground">
         {/* The board — a faint checker, faded toward the centre so the sign-in sits clean. */}
         <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
               backgroundImage:
                  'repeating-conic-gradient(var(--foreground) 0 25%, transparent 0 50%)',
               backgroundSize: '56px 56px',
               opacity: 0.035,
               maskImage: 'radial-gradient(120% 120% at 50% 38%, transparent 32%, #000 78%)',
               WebkitMaskImage: 'radial-gradient(120% 120% at 50% 38%, transparent 32%, #000 78%)',
            }}
         />
         {/* A soft green light behind the mark. */}
         <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[26%] h-72 w-72 -translate-x-1/2 rounded-full"
            style={{
               background:
                  'radial-gradient(circle, color-mix(in oklab, var(--primary) 22%, transparent), transparent 68%)',
            }}
         />

         <motion.div
            className="relative w-full max-w-sm"
            variants={
               reduce
                  ? undefined
                  : {
                       hidden: {},
                       show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
                    }
            }
            initial={reduce ? false : 'hidden'}
            animate={reduce ? undefined : 'show'}
         >
            <div className="mb-7 flex flex-col items-center text-center">
               <motion.div variants={mark}>
                  <CastleMark className="mb-4 size-14 rounded-xl shadow-sm" />
               </motion.div>
               <motion.h1 variants={rise} className="text-2xl font-semibold tracking-tight">
                  Shortcastle Ops
               </motion.h1>
               <motion.p
                  variants={rise}
                  className="mt-2 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground"
               >
                  O-O · operations console
               </motion.p>
            </div>

            <motion.form
               variants={rise}
               onSubmit={submit}
               className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
            >
               <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                     Email
                  </label>
                  <input
                     type="email"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     autoFocus
                     className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35"
                     placeholder="you@shortcastle.com"
                  />
               </div>
               <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                     Password
                  </label>
                  <input
                     type="password"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/35"
                     placeholder="••••••••"
                  />
               </div>
               {err && <p className="text-xs text-destructive">{err}</p>}
               <button
                  type="submit"
                  disabled={busy || !email || !password}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
               >
                  {busy ? 'Signing in…' : 'Sign in'}
               </button>

               {clientId && (
                  <>
                     <div className="flex items-center gap-3 pt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        or
                        <span className="h-px flex-1 bg-border" />
                     </div>
                     <div className="flex flex-col items-center gap-1.5">
                        <div ref={gbtn} className="flex justify-center" />
                        {gmsg && <p className="text-xs text-destructive">{gmsg}</p>}
                     </div>
                  </>
               )}

               <Crenellation className="!mt-5" />
               <p className="pt-1 text-center text-[11px] text-muted-foreground">
                  For Shortcastle ops accounts. Access is managed in the tracker&apos;s Members tab.
               </p>
            </motion.form>
         </motion.div>
      </div>
   );
}
