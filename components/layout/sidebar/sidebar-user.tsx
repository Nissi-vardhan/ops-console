'use client';

import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { ThemeToggleButton } from '@/components/layout/theme-toggle-button';

function signOut() {
   fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign_out' }),
   }).finally(() => {
      window.location.href = '/login';
   });
}

/** Signed-in user card for the sidebar footer — avatar, name/email, sign out. */
export function SidebarUser() {
   const [me, setMe] = useState<{ email?: string; username?: string } | null>(null);
   useEffect(() => {
      fetch('/api/ops/me', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setMe(d?.user ?? null))
         .catch(() => {});
   }, []);

   const name = me?.username || (me?.email ? me.email.split('@')[0] : 'Ops');
   const initials = name.slice(0, 2).toUpperCase();

   return (
      <div className="flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-2">
         <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {initials}
         </span>
         <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{me?.email || 'signed in'}</p>
         </div>
         <div className="flex shrink-0 items-center gap-0.5">
            <ThemeToggleButton />
            <button
               onClick={signOut}
               title="Sign out"
               aria-label="Sign out"
               className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
               <LogOut className="size-4" />
            </button>
         </div>
      </div>
   );
}
