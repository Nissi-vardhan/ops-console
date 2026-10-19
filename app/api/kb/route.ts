import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/ops-guard';
import { listKbDocs, searchKbDocs } from '@/lib/ops-data';
import { selectKbDocs } from '@/lib/kb-select';

// Read-only, workspace-scoped KB feed for server-to-server callers (the
// Chesslang WhatsApp AI via n8n). Single-purpose on purpose:
//  - ONLY `Authorization: Bearer <KB_READ_TOKEN>` is accepted — no session
//    cookie, no OPS_AUTH_SECRET. KB_READ_TOKEN grants nothing else in the app.
//  - KB_READ_TOKEN unset → 503 (endpoint disabled).
//  - ?ws must be listed in KB_READ_WORKSPACES (comma list) → else 403.
//  - category 'KB' of that workspace only; approved-only unless
//    KB_READ_APPROVED_ONLY is the literal "false".
//  - optional ?q=<customer question>&limit=N (default 5, max 20): only the best-matching
//    articles (full-text), so a bot sends a few articles to its model, not the whole KB.
//    No match → empty list (the bot should say it doesn't know and hand over).
// GET only (Next answers 405 for other methods); no CORS headers.
export const dynamic = 'force-dynamic';

function deny(status: number, error: string) {
   return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
   const kbToken = process.env.KB_READ_TOKEN || '';
   const opsSecret = process.env.OPS_AUTH_SECRET || '';
   // Disabled when unset, or when misconfigured to equal the admin secret.
   if (!kbToken || (opsSecret && safeEqual(kbToken, opsSecret)))
      return deny(503, 'KB API disabled');

   const auth = request.headers.get('authorization') || '';
   const m = /^Bearer\s+(.+)$/i.exec(auth);
   if (!m || !safeEqual(m[1].trim(), kbToken)) return deny(401, 'Unauthorized');

   const ws = (new URL(request.url).searchParams.get('ws') || '').trim().toLowerCase();
   if (!ws) return deny(400, 'ws is required');
   const allowed = (process.env.KB_READ_WORKSPACES || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
   if (!allowed.includes(ws)) return deny(403, 'Forbidden');

   const approvedOnly = process.env.KB_READ_APPROVED_ONLY !== 'false';
   const sp = new URL(request.url).searchParams;
   const q = (sp.get('q') || '').trim().slice(0, 500);
   if (q) {
      const limit = Math.min(20, Math.max(1, Number(sp.get('limit')) || 5));
      const ranked = await searchKbDocs(ws, approvedOnly, q, limit * 3);
      const order = new Map(ranked.map((d, i) => [d.id, i]));
      // selectKbDocs dedupes versions but sorts by title; put the best matches first again.
      const hits = selectKbDocs(ranked)
         .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
         .slice(0, limit);
      return NextResponse.json(
         { ws, q, docs: hits },
         { headers: { 'Cache-Control': 'private, max-age=60' } }
      );
   }
   const docs = selectKbDocs(await listKbDocs(ws, approvedOnly));
   return NextResponse.json({ ws, docs }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
