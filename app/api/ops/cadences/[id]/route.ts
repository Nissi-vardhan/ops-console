import { NextResponse } from "next/server";
import { getOpsCadence, updateOpsCadence, deleteOpsCadence } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cadence = await getOpsCadence((await params).id);
  if (!cadence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ cadence });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const cadence = await updateOpsCadence((await params).id, body ?? {});
  if (!cadence) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ cadence });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: await deleteOpsCadence((await params).id) });
}
