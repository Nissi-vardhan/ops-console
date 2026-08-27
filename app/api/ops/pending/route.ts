import { NextResponse } from "next/server";
import { getPending } from "@/lib/ops-pending";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { snapshot, updated_at } = await getPending();
  return NextResponse.json({ pending: snapshot, updated_at });
}
