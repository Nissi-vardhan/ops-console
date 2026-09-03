'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { Bell, Mail, Monitor, Slack } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

// Where + what you get notified about. In-app notifications always land in the
// bell; these preferences persist per-browser.
const CHANNELS: { key: string; icon: ReactNode; title: string; description: string }[] = [
   {
      key: 'browser',
      icon: <Monitor className="size-4" />,
      title: 'Browser',
      description: 'Desktop push while the ops console is open',
   },
   {
      key: 'email',
      icon: <Mail className="size-4" />,
      title: 'Email',
      description: 'A summary to your Shortcastle inbox',
   },
   {
      key: 'slack',
      icon: <Slack className="size-4" />,
      title: 'Slack',
      description: 'A direct message in your workspace',
   },
];

const EVENTS: { key: string; title: string; description: string }[] = [
   { key: 'assigned', title: 'Assigned to me', description: 'A task is assigned to you' },
   {
      key: 'status',
      title: 'Status changes',
      description: 'A task you created or own changes status',
   },
   {
      key: 'mentions',
      title: 'Comments & mentions',
      description: 'Someone comments on or @-mentions you on a task or doc',
   },
   {
      key: 'reviews',
      title: 'Doc reviews',
      description: 'A doc is shared with you or its review stage changes',
   },
   {
      key: 'blockers',
      title: 'Blockers & cadences',
      description: 'A new blocker or pending cadence step lands on the board',
   },
];

const STORE_KEY = 'ops_notif_prefs';
const ALL = [...CHANNELS, ...EVENTS].map((x) => x.key);
const defaults = (): Record<string, boolean> => Object.fromEntries(ALL.map((k) => [k, true]));

/** Personal notification preferences (channels + which ops events notify you). */
export default function AccountNotifications() {
   const [prefs, setPrefs] = useState<Record<string, boolean>>(defaults);

   useEffect(() => {
      try {
         const raw = localStorage.getItem(STORE_KEY);
         if (raw) setPrefs({ ...defaults(), ...JSON.parse(raw) });
      } catch {
         /* storage blocked — keep defaults */
      }
   }, []);

   const set = (key: string, v: boolean) => {
      setPrefs((prev) => {
         const next = { ...prev, [key]: v };
         try {
            localStorage.setItem(STORE_KEY, JSON.stringify(next));
         } catch {
            /* storage blocked */
         }
         return next;
      });
   };

   return (
      <SettingsShell title="Notifications">
         <SettingsSection
            title="Channels"
            description="Where you'd like to be notified. In-app notifications always appear in the bell regardless of these."
         >
            <SettingsCard>
               {CHANNELS.map((c) => (
                  <SettingsRow
                     key={c.key}
                     icon={c.icon}
                     title={c.title}
                     description={c.description}
                     trailing={
                        <Switch
                           checked={prefs[c.key] ?? true}
                           onCheckedChange={(v) => set(c.key, v)}
                           aria-label={`${c.title} notifications`}
                        />
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Notify me about"
            description="Pick the ops events worth a ping. Everything still shows in the console."
         >
            <SettingsCard>
               {EVENTS.map((e) => (
                  <SettingsRow
                     key={e.key}
                     icon={<Bell className="size-4" />}
                     title={e.title}
                     description={e.description}
                     trailing={
                        <Switch
                           checked={prefs[e.key] ?? true}
                           onCheckedChange={(v) => set(e.key, v)}
                           aria-label={e.title}
                        />
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
