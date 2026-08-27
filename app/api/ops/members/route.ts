import { NextResponse } from "next/server";
import { listOpsMembers } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

// Real Members become the assignee/lead options in the ops console.
export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ members: await listOpsMembers() });
}
