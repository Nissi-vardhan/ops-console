import { NextResponse } from "next/server";
import { listOpsServices, createOpsService } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ services: await listOpsServices() });
}

export async function POST(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => null);
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const service = await createOpsService({
    name, kind: b?.kind, url: b?.url ?? null, owner: b?.owner ?? null,
    notes: b?.notes, expires_at: b?.expires_at ?? null, last_rotated_at: b?.last_rotated_at ?? null,
  });
  return NextResponse.json({ service }, { status: 201 });
}
