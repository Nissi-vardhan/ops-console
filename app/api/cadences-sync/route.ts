import { NextResponse } from "next/server";
import { setCadencesFeed, normalizeCadencesFeed } from "@/lib/ops-cadences-feed";

// Headless full-replace push of the real Zoho outreach cadences. Auth via
// SYNC_SECRET (reuse the "Tracker Sync" httpHeaderAuth n8n credential). These
// render alongside the UI-authored ops_cadences rows; this feed never touches them.
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
    return NextResponse.json({ error: "expected { cadences: [...] }" }, { status: 400 });
  }
  const snapshot = normalizeCadencesFeed(body);
  await setCadencesFeed(snapshot);
  return NextResponse.json({ ok: true, cadences: snapshot.cadences.length });
}
