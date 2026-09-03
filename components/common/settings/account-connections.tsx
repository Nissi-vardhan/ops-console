'use client';

import { type ReactNode } from 'react';
import { Server, Workflow, Database } from 'lucide-react';
import { INTEGRATION_LOGOS } from './integration-logos';
import { EnabledDot, SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const SlackLogo = INTEGRATION_LOGOS['slack'];
const GithubLogo = INTEGRATION_LOGOS['github'];
const GoogleLogo = INTEGRATION_LOGOS['google-calendar'];

const Live = () => (
   <EnabledDot>
      <span className="text-foreground">Live</span>
   </EnabledDot>
);

// The integrations that actually back the ops console + tracker. These are wired
// server-side for the workspace (not per-user OAuth), so this page is a reference.
const INTEGRATIONS: { icon: ReactNode; title: string; description: string }[] = [
   {
      icon: <SlackLogo className="size-4" />,
      title: 'Slack',
      description: 'Doc comment threads sent to Claude, and ops notifications',
   },
   {
      icon: <GoogleLogo className="size-4" />,
      title: 'Google',
      description: 'Google sign-in for the dashboard and gated doc-share links',
   },
   {
      icon: <GithubLogo className="size-4" />,
      title: 'GitHub',
      description: 'Source for ops-console + tracker; Coolify deploys on push',
   },
   {
      icon: <Workflow className="size-4 text-primary" />,
      title: 'n8n',
      description: 'Nightly automations that feed the tracker, cadences and workflows',
   },
   {
      icon: <Database className="size-4 text-primary" />,
      title: 'Zoho CRM',
      description: 'Lead + demo data behind cadences and the outreach flows',
   },
   {
      icon: <Server className="size-4 text-primary" />,
      title: 'Coolify',
      description: 'Hosts both apps + Postgres on the Hetzner server',
   },
];

/** What powers the console — a workspace-level integration reference. */
export default function AccountConnections() {
   return (
      <SettingsShell
         title="Integrations"
         description="The services wired into the ops console + tracker. Configured for the workspace, not per-user."
      >
         <SettingsSection>
            <SettingsCard>
               {INTEGRATIONS.map((i) => (
                  <SettingsRow
                     key={i.title}
                     icon={i.icon}
                     title={i.title}
                     description={i.description}
                     trailing={<Live />}
                  />
               ))}
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
