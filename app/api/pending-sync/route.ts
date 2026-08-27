import { NextResponse } from "next/server";
import { setPending, normalizePending } from "@/lib/ops-pending";

// Headless push of ops "pending work" (shared blockers + per-cadence pending
// steps) from the One Chesslang outreach build. Auth via SYNC_SECRET (reuse the
// "Tracker Sync" httpHeaderAuth n8n credential — Bearer <SYNC_SECRET>).
function authorized(request: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return token === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "expected a JSON object { blockers?, cadences?, as_of? }" }, { status: 400 });
  }
  const snapshot = normalizePending(body);
  await setPending(snapshot);
  return NextResponse.json({ ok: true, blockers: snapshot.blockers.length, cadences: snapshot.cadences.length });
}
