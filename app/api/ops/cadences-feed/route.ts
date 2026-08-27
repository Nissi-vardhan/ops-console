import { NextResponse } from "next/server";
import { getCadencesFeed } from "@/lib/ops-cadences-feed";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { snapshot, updated_at } = await getCadencesFeed();
  return NextResponse.json({ feed: snapshot, updated_at });
}
