'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Personal "Profile" settings — bound to the signed-in ops user. */
export default function Profile() {
   const [me, setMe] = useState<{ email?: string; username?: string } | null>(null);
   useEffect(() => {
      fetch('/api/ops/me', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setMe(d?.user ?? null))
         .catch(() => {});
   }, []);

   const email = me?.email ?? '—';
   const username = me?.username ?? '';
   const display = username || (me?.email ? me.email.split('@')[0] : 'Ops');
   const initials = display.slice(0, 2).toUpperCase();

   return (
      <SettingsShell title="Profile">
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Profile picture"
                  trailing={
                     <Avatar className="size-9">
                        <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                           {initials}
                        </AvatarFallback>
                     </Avatar>
                  }
               />
               <SettingsRow
                  title="Email"
                  trailing={<span className="text-foreground">{email}</span>}
               />
               <SettingsRow
                  title="Username"
                  description="Used to sign in and for attribution"
                  trailing={<Input defaultValue={username} className="h-8 w-44" />}
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
