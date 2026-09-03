'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { KeyRound, LogOut, Mail } from 'lucide-react';
import { INTEGRATION_LOGOS } from './integration-logos';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

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
