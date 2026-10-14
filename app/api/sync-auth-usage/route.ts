import { NextResponse } from 'next/server';
import { syncAuthorized, previousSecretUses } from '@/lib/sync-auth';
import { requireRole } from '@/lib/ops-guard';

// GET → which routes received the previous SYNC secret since this server started (SC-330
// rotation): empty for a few days after the senders switch = safe to drop SYNC_SECRET_PREVIOUS.
// Auth: Bearer SYNC_SECRET, or the ops CLI bearer / an admin session.
export async function GET(request: Request) {
   if (!syncAuthorized(request)) {
      const denied = await requireRole(request, 'admin');
      if (denied) return denied;
   }
   return NextResponse.json({
      previous_set: !!process.env.SYNC_SECRET_PREVIOUS,
      outbound_override: !!process.env.SYNC_SECRET_OUTBOUND,
      uses: previousSecretUses(),
   });
}
