import { NextResponse } from "next/server";
import { updateOpsIssue, deleteOpsIssue, appendIssueProgress, resolveOpsIssueId } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

// `id` may be a uuid or an OPS-<n> identifier.
async function resolve(raw: string): Promise<string | null> {
  return resolveOpsIssueId(raw);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await resolve((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const issue = await updateOpsIssue(id, body ?? {});
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ issue });
}

// Append a progress note: POST { note, author_id? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await resolve((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) return NextResponse.json({ error: "note is required" }, { status: 400 });
  const issue = await appendIssueProgress(id, note, body?.author_id ?? null);
  if (!issue) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ issue });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await resolve((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: await deleteOpsIssue(id) });
}
