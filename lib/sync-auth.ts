import { timingSafeEqual } from 'crypto';

// Bearer SYNC_SECRET check shared by the headless feeder routes (n8n / peer apps → ops).
// Rotation (SC-330): SYNC_SECRET is the current secret; SYNC_SECRET_PREVIOUS (optional) is
// still accepted while senders move over, and every route that receives it is counted so
// stragglers can be found (GET /api/sync-auth-usage). Calls ops makes to the CRM / tracker
// use syncSecretOut(): SYNC_SECRET_OUTBOUND when set (peer not switched yet), else SYNC_SECRET.
const prevUses = new Map<string, { count: number; last: string }>();

const same = (a: string, b: string) => {
   const ab = Buffer.from(a, 'utf8');
   const bb = Buffer.from(b, 'utf8');
   return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export function syncSecretOut(): string {
   return process.env.SYNC_SECRET_OUTBOUND || process.env.SYNC_SECRET || '';
}

export function isSyncToken(token: string | null | undefined, request?: Request): boolean {
   const cur = process.env.SYNC_SECRET;
   const prev = process.env.SYNC_SECRET_PREVIOUS;
   if (!token) return false;
   if (cur && same(token, cur)) return true;
   if (prev && same(token, prev)) {
      let path = '?';
      try {
         path = request ? new URL(request.url).pathname : '?';
      } catch {
         /* keep ? */
      }
      const u = prevUses.get(path) ?? { count: 0, last: '' };
      u.count++;
      u.last = new Date().toISOString();
      prevUses.set(path, u);
      if (u.count === 1) console.warn(`[sync-auth] previous SYNC secret used on ${path}`);
      return true;
   }
   return false;
}

export function syncAuthorized(request: Request): boolean {
   const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
   return isSyncToken(token, request);
}

// Routes that received the previous secret since this server started.
export function previousSecretUses(): { path: string; count: number; last: string }[] {
   return [...prevUses.entries()]
      .map(([path, u]) => ({ path, ...u }))
      .sort((a, b) => b.count - a.count);
}
