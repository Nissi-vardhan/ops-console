'use client';

import { useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { CastleMark, Crenellation } from '@/components/brand/castle-mark';
import { easeOut } from '@/components/motion';

export default function OpsLogin() {
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [busy, setBusy] = useState(false);
   const [err, setErr] = useState<string | null>(null);

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
               <Crenellation className="!mt-5" />
               <p className="pt-1 text-center text-[11px] text-muted-foreground">
                  For Shortcastle ops accounts. Access is managed in the tracker&apos;s Members tab.
               </p>
            </motion.form>
         </motion.div>
      </div>
   );
}
