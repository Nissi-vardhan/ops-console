import { NextResponse } from 'next/server';
import { getPending } from '@/lib/ops-pending';
import { requireStaff } from '@/lib/ops-guard';

export async function GET(request: Request) {
   const denied = await requireStaff(request);
   if (denied) return denied;
   const { snapshot, updated_at } = await getPending();
   return NextResponse.json({ pending: snapshot, updated_at });
}
