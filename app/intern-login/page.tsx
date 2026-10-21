'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TasksMark } from '@/components/intern-mode';

// Sign-in for interns on the intern host (SC-430); served at /login there. Logins are created
// by an owner on the Interns page.
export default function InternLoginPage() {
   const [login, setLogin] = useState('');
   const [password, setPassword] = useState('');
   const [error, setError] = useState('');
   const [busy, setBusy] = useState(false);

   const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError('');
      const r = await fetch('/v1/login', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ login, password }),
      }).catch(() => null);
      const d = r ? await r.json().catch(() => null) : null;
      if (r?.ok) window.location.href = '/tasks/my-issues';
      else {
         setError(d?.error || 'Could not sign in. Try again.');
         setBusy(false);
      }
   };

   return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
         <form
            onSubmit={submit}
            className="w-full max-w-sm space-y-4 rounded-xl border bg-container p-6"
         >
            <div className="flex items-center gap-2">
               <TasksMark className="size-7" />
               <span className="text-base font-semibold">TrainerDB Tasks</span>
            </div>
            <p className="text-sm text-muted-foreground">
               Sign in with the username and password you were given.
            </p>
            <label className="block space-y-1 text-sm">
               <span className="text-muted-foreground">Username</span>
               <Input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
               />
            </label>
            <label className="block space-y-1 text-sm">
               <span className="text-muted-foreground">Password</span>
               <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
               />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !login || !password}>
               {busy ? 'Signing in…' : 'Sign in'}
            </Button>
         </form>
      </main>
   );
}
