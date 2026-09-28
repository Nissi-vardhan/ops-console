import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/ops-guard';
import { listKbDocs } from '@/lib/ops-data';
import { selectKbDocs } from '@/lib/kb-select';

// Read-only, workspace-scoped KB feed for server-to-server callers (the
// Chesslang WhatsApp AI via n8n). Single-purpose on purpose:
//  - ONLY `Authorization: Bearer <KB_READ_TOKEN>` is accepted — no session
//    cookie, no OPS_AUTH_SECRET. KB_READ_TOKEN grants nothing else in the app.
//  - KB_READ_TOKEN unset → 503 (endpoint disabled).
//  - ?ws must be listed in KB_READ_WORKSPACES (comma list) → else 403.
//  - category 'KB' of that workspace only; approved-only unless
//    KB_READ_APPROVED_ONLY is the literal "false".
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
   const docs = selectKbDocs(await listKbDocs(ws, approvedOnly));
   return NextResponse.json({ ws, docs }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
