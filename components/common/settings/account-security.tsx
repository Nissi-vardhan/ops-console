'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Lock, LogOut, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { INTEGRATION_LOGOS } from './integration-logos';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/** Inline "change my password" form, posted to /api/account/password. */
function ChangePassword() {
   const [current, setCurrent] = useState('');
   const [next, setNext] = useState('');
   const [confirm, setConfirm] = useState('');
   const [busy, setBusy] = useState(false);

   const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (next !== confirm) {
         toast.error('New passwords do not match.');
         return;
      }
      if (next.length < 8) {
         toast.error('New password must be at least 8 characters.');
         return;
      }
      setBusy(true);
      try {
         const res = await fetch('/api/account/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: current, newPassword: next }),
         });
         const data = await res.json().catch(() => null);
         if (!res.ok) {
            toast.error(data?.error ?? 'Could not change password.');
            return;
         }
         toast.success('Password updated.');
         setCurrent('');
         setNext('');
         setConfirm('');
      } catch {
         toast.error('Could not change password.');
      } finally {
         setBusy(false);
      }
   };

   return (
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
         <div className="flex flex-col gap-1.5">
            <Label htmlFor="cur-pw">Current password</Label>
            <Input
               id="cur-pw"
               type="password"
               autoComplete="current-password"
               value={current}
               onChange={(e) => setCurrent(e.target.value)}
            />
         </div>
         <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <Input
               id="new-pw"
               type="password"
               autoComplete="new-password"
               value={next}
               onChange={(e) => setNext(e.target.value)}
            />
         </div>
         <div className="flex flex-col gap-1.5">
            <Label htmlFor="conf-pw">Confirm new password</Label>
            <Input
               id="conf-pw"
               type="password"
               autoComplete="new-password"
               value={confirm}
               onChange={(e) => setConfirm(e.target.value)}
            />
         </div>
         <div>
            <Button type="submit" size="sm" disabled={busy || !current || !next || !confirm}>
               {busy ? 'Updating…' : 'Update password'}
            </Button>
         </div>
      </form>
   );
}

const GoogleLogo = INTEGRATION_LOGOS['google-calendar'];

/** Security & access — honest to how the ops console actually authenticates. */
export default function AccountSecurity() {
   const [email, setEmail] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);

   useEffect(() => {
      fetch('/api/ops/me', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setEmail(d?.user?.email ?? null))
         .catch(() => {});
   }, []);

   const signOut = async () => {
      setBusy(true);
      await fetch('/api/auth', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ action: 'sign_out' }),
      }).catch(() => {});
      window.location.href = '/login';
   };

   return (
      <SettingsShell title="Security & access">
         <SettingsSection title="How you sign in" description="Your ops console account.">
            <SettingsCard>
               <SettingsRow
                  icon={<Mail className="size-4" />}
                  title="Email & password"
                  description={email ? `Signed in as ${email}` : 'Email + password'}
               />
               <SettingsRow
                  icon={<GoogleLogo className="size-4" />}
                  title="Google sign-in"
                  description="Continue with an allow-listed Google account"
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Change password"
            description="Update the password for your email + password login."
         >
            <SettingsCard>
               <SettingsRow
                  icon={<Lock className="size-4" />}
                  title="Password"
                  description="At least 8 characters. You stay signed in after changing it."
               />
               <ChangePassword />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Session"
            description="Access is a 30-day signed cookie in this browser."
         >
            <SettingsCard>
               <SettingsRow
                  icon={<LogOut className="size-4" />}
                  title="Sign out of this browser"
                  description="You'll need to sign in again to get back in."
                  trailing={
                     <Button size="sm" variant="outline" onClick={signOut} disabled={busy}>
                        Sign out
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Workspace access"
            description="Server-to-server access is a shared bearer secret used by the ops CLI and nightly feeds — managed in Infra, not here."
         >
            <SettingsCard>
               <SettingsRow
                  icon={<KeyRound className="size-4" />}
                  title="OPS_AUTH_SECRET"
                  description="Rotate it from the Infra & tokens registry"
                  muted
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
