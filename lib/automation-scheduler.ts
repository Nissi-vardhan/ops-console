import { maybeSendScheduledSummary, pollAll } from '@/lib/ops-automations';

// In-process timer for the Automation tab: poll every 5 min, and once a minute
// check whether the 08:30 IST summary is due. pollAll() takes a pg advisory
// lock and the summary is idempotent per IST day, so a second instance (or a
// dev hot-reload) can't double-poll or double-send. Set AUTOMATION_POLL=off to
// disable (e.g. local sandbox without n8n).
const g = globalThis as unknown as { __automationTimer?: ReturnType<typeof setInterval> };

export function startAutomationScheduler(): void {
   if (g.__automationTimer || process.env.AUTOMATION_POLL === 'off') return;
   let tick = 0;
   const run = async () => {
      try {
         if (tick % 5 === 0) await pollAll();
         await maybeSendScheduledSummary();
      } catch (e) {
         console.error('[automations] tick failed:', (e as Error).message);
      }
      tick++;
   };
   g.__automationTimer = setInterval(run, 60_000);
   setTimeout(run, 20_000); // first pass shortly after boot
}
