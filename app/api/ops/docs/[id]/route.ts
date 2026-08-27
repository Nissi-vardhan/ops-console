import { NextResponse } from "next/server";
import { getOpsDoc, updateOpsDoc, deleteOpsDoc } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const doc = await getOpsDoc((await params).id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ doc });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const doc = await updateOpsDoc((await params).id, body ?? {});
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ doc });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: await deleteOpsDoc((await params).id) });
}
