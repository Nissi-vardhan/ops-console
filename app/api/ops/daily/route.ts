import { NextResponse } from "next/server";
import { getDailyUpdate, listDailyDates } from "@/lib/ops-digest";
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

// Regenerate (a Refresh button, or the nightly scheduler). Defaults to today (IST).
export async function POST(request: Request) {
  if (!(await opsAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || istToday();
  if (!DAY_RE.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  return NextResponse.json({ update: await getDailyUpdate(date, true) });
}
