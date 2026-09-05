'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';
import { AccountSecuritySections } from './account-security';

/** Merged "Account" settings — profile + security for the signed-in ops user. */
export default function Profile() {
   const [me, setMe] = useState<{ email?: string; username?: string } | null>(null);
   const [name, setName] = useState('');
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      fetch('/api/ops/me', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            setMe(d?.user ?? null);
            setName(d?.user?.username ?? '');
         })
         .catch(() => {});
   }, []);

   const email = me?.email ?? '—';
   const display = name || (me?.email ? me.email.split('@')[0] : 'Ops');
   const initials = display.slice(0, 2).toUpperCase();
   const dirty = me != null && name.trim() !== (me.username ?? '') && name.trim().length > 0;

   const saveName = async () => {
      setSaving(true);
      try {
         const r = await fetch('/api/account/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name.trim() }),
         });
         const d = await r.json().catch(() => ({}));
         if (!r.ok) throw new Error(d?.error || 'Could not save.');
         setMe((m) => ({ ...m, username: d.username }));
         setName(d.username);
         toast.success('Name saved.');
      } catch (e) {
         toast.error((e as Error).message);
      } finally {
         setSaving(false);
      }
   };

   return (
      <SettingsShell title="Account" description="Your profile and how you sign in.">
         <SettingsSection title="Profile">
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
                  trailing={
                     <div className="flex items-center gap-2">
                        <Input
                           value={name}
                           onChange={(e) => setName(e.target.value)}
                           onKeyDown={(e) => {
                              if (e.key === 'Enter' && dirty && !saving) saveName();
                           }}
                           className="h-8 w-40"
                        />
                        <Button size="sm" onClick={saveName} disabled={!dirty || saving}>
                           {saving ? 'Saving…' : 'Save'}
                        </Button>
                     </div>
                  }
               />
            </SettingsCard>
         </SettingsSection>
         <AccountSecuritySections />
      </SettingsShell>
   );
}
