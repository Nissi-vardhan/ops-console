import { NextResponse } from 'next/server';
import { listOpsServices, createOpsService } from '@/lib/ops-data';
import { requireRole, requireStaff } from '@/lib/ops-guard';

export async function GET(request: Request) {
   const denied = await requireStaff(request);
   if (denied) return denied;
   return NextResponse.json({ services: await listOpsServices() });
}

export async function POST(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   const b = await request.json().catch(() => null);
   const name = typeof b?.name === 'string' ? b.name.trim() : '';
   if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
   const service = await createOpsService({
      name,
      kind: b?.kind,
      url: b?.url ?? null,
      owner: b?.owner ?? null,
      notes: b?.notes,
      expires_at: b?.expires_at ?? null,
      last_rotated_at: b?.last_rotated_at ?? null,
   });
   return NextResponse.json({ service }, { status: 201 });
}
