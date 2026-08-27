import { NextResponse } from "next/server";
import { updateOpsService, deleteOpsService } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const service = await updateOpsService((await params).id, body ?? {});
  if (!service) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ service });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: await deleteOpsService((await params).id) });
}
