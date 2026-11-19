import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

// SC-675: the deploy health check (same idea as Shortcastle CRM, SC-397). Coolify keeps the old
// container serving until a new one answers 200 here: up, and the database answers. Cheap on
// purpose: one `SELECT 1` with a short timeout, no session.
export const dynamic = 'force-dynamic';

export async function GET() {
   try {
      await Promise.race([
         getPool().query('SELECT 1'),
         new Promise((_, no) => setTimeout(() => no(new Error('db timeout')), 2000)),
      ]);
      return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
   } catch {
      return NextResponse.json(
         { ok: false },
         { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
   }
}
