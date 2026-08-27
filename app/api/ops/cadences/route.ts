import { NextResponse } from "next/server";
import { listOpsCadences, createOpsCadence } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ cadences: await listOpsCadences() });
}

export async function POST(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const cadence = await createOpsCadence({
    name,
    audience: body?.audience,
    channels: body?.channels,
    status: body?.status,
    issue_id: body?.issue_id ?? null,
    touches: Array.isArray(body?.touches) ? body.touches : [],
    blockers: Array.isArray(body?.blockers) ? body.blockers : [],
    notes: body?.notes,
    created_by: body?.created_by ?? null,
  });
  return NextResponse.json({ cadence }, { status: 201 });
}
