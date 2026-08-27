import { NextResponse } from "next/server";
import { recall } from "@/lib/ops-recall";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit")) || 12));
  const hits = await recall(q, limit);
  return NextResponse.json({ hits, query: q });
}
