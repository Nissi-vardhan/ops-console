import { NextResponse } from 'next/server';
import { updateStep, deleteStep } from '@/lib/ops-data';
import { opsAuthorized } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';

// Who to credit for a completion: an explicit `by` (the CLI passes a user id or a
// session tag) wins, else the signed-in browser user.
async function actor(bodyBy: unknown): Promise<string | null> {
   if (typeof bodyBy === 'string' && bodyBy.trim()) return bodyBy.trim();
   return (await getOpsUser())?.username ?? null;
}

// PATCH /api/ops/steps/:id — update/complete/skip/reopen a step, or edit its text.
// Body: { status?, title?, note?, phase?, seq?, by? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const body = await request.json().catch(() => ({}));
   const { by, ...patch } = body ?? {};
   const step = await updateStep((await params).id, patch ?? {}, await actor(by));
   if (!step) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ step });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ ok: await deleteStep((await params).id) });
}
