import { NextResponse } from "next/server";
import { listOpsDocs, createOpsDoc } from "@/lib/ops-data";
import { opsAuthorized } from "@/lib/ops-guard";

export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ docs: await listOpsDocs() });
}

export async function POST(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const doc = await createOpsDoc({
    title,
    body: body?.body,
    category: body?.category,
    pinned: body?.pinned === true,
    created_by: body?.created_by ?? null,
  });
  return NextResponse.json({ doc }, { status: 201 });
}
