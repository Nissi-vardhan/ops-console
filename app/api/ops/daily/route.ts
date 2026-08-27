import { NextResponse } from "next/server";
import { getDailyUpdate, listDailyDates, saveDailyContent } from "@/lib/ops-digest";
import { opsAuthorized } from "@/lib/ops-guard";

// IST calendar day (updates are keyed to the user's day).
function istToday(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 10);
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date) return NextResponse.json({ dates: await listDailyDates(), today: istToday() });
  if (!DAY_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  return NextResponse.json({ update: await getDailyUpdate(date) });
}

// Regenerate. ?force=1 (the Refresh button) always regenerates. Without force
// (the nightly 11PM scheduler) it refreshes only if the update hasn't been
// hand-edited — so a saved edit is never silently clobbered.
export async function POST(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || istToday();
  if (!DAY_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  if (url.searchParams.get("force") !== "1") {
    const existing = await getDailyUpdate(date); // get-or-generate
    if (existing.edited) return NextResponse.json({ update: existing });
  }
  return NextResponse.json({ update: await getDailyUpdate(date, true) });
}

// Save a human-edited version: PUT ?date=X { content }
export async function PUT(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || istToday();
  if (!DAY_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";
  return NextResponse.json({ update: await saveDailyContent(date, content) });
}
