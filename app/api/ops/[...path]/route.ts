import { NextResponse, type NextRequest } from "next/server";
import { getOpsUser } from "@/lib/ops-session";

// Proxy the ops workspace data calls to the tracker backend, server-side, so the
// shared secret never reaches the browser. Requires a valid ops session.
const BASE = process.env.OPS_API_BASE; // https://tracker.shortcastle.com/api/ops
const SECRET = process.env.OPS_AUTH_SECRET;

async function forward(req: NextRequest, segments: string[]) {
  const user = await getOpsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!BASE || !SECRET) return NextResponse.json({ error: "Ops API not configured" }, { status: 500 });

  const path = segments.join("/");
  const url = `${BASE}/${path}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    cache: "no-store",
  };

  if (req.method !== "GET" && req.method !== "DELETE") {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      body = {};
    }
    // stamp the creator on new issues from the session
    if (req.method === "POST" && path === "issues" && !body.created_by) {
      body.created_by = user.id;
    }
    init.body = JSON.stringify(body);
  }

  const r = await fetch(url, init);
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}
