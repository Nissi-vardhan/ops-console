import { NextResponse } from 'next/server';
import {
   updateOpsIssue,
   deleteOpsIssue,
   appendIssueProgress,
   resolveOpsIssueId,
   getOpsIssue,
   listIssueSteps,
   type OpsTaskStep,
} from '@/lib/ops-data';
import {
   opsAuthorized,
   requireRole,
   accessibleWorkspaces,
   workspaceAllowed,
} from '@/lib/ops-guard';
import { JOURNEY_PHASES } from '@/lib/journey';

// `id` may be a uuid or an OPS-<n> identifier.
async function resolve(raw: string): Promise<string | null> {
   return resolveOpsIssueId(raw);
}

// True if the caller may not access the issue's workspace. Assumes `id` is an
// already-resolved uuid that exists; returns 403-worthy on cross-workspace.
async function issueForbidden(id: string): Promise<boolean> {
   const issue = await getOpsIssue(id);
   return !workspaceAllowed(await accessibleWorkspaces(), issue?.workspace ?? null);
}

function byPhase(steps: OpsTaskStep[]): Record<string, OpsTaskStep[]> {
   const g: Record<string, OpsTaskStep[]> = {};
   for (const p of JOURNEY_PHASES) g[p] = [];
   for (const s of steps) (g[s.phase] ??= []).push(s);
   return g;
}

// GET /api/ops/issues/:id — one issue with its journey steps grouped by phase.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const id = await resolve((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   const issue = await getOpsIssue(id);
   if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (!workspaceAllowed(await accessibleWorkspaces(), issue.workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const steps = await listIssueSteps(id);
   return NextResponse.json({ issue, steps, byPhase: byPhase(steps) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const id = await resolve((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (await issueForbidden(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const body = await request.json().catch(() => ({}));
   const issue = await updateOpsIssue(id, body ?? {});
   if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ issue });
}

// Append a progress note: POST { note, author_id?, session? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const id = await resolve((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (await issueForbidden(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const body = await request.json().catch(() => null);
   const note = typeof body?.note === 'string' ? body.note.trim() : '';
   if (!note) return NextResponse.json({ error: 'note is required' }, { status: 400 });
   const session = typeof body?.session === 'string' ? body.session : null;
   const issue = await appendIssueProgress(id, note, body?.author_id ?? null, session);
   if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   return NextResponse.json({ issue });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
   const denied = await requireRole(request, 'member');
   if (denied) return denied;
   const id = await resolve((await params).id);
   if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
   if (await issueForbidden(id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   return NextResponse.json({ ok: await deleteOpsIssue(id) });
}
