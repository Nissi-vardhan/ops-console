import { NextResponse } from 'next/server';
import { getCadencesFeed } from '@/lib/ops-cadences-feed';
import { requireStaff } from '@/lib/ops-guard';

export async function GET(request: Request) {
   const denied = await requireStaff(request);
   if (denied) return denied;
   const { snapshot, updated_at } = await getCadencesFeed();
   return NextResponse.json({ feed: snapshot, updated_at });
}
