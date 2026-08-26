import { NextResponse } from "next/server";
import { setOpsCookie, clearOpsCookie } from "@/lib/ops-session";

// Login for the ops console. Delegates credential + ops-access verification to
// the tracker (OPS_AUTH_URL, shared OPS_AUTH_SECRET); on success sets the session.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (body?.action === "sign_out") {
    await clearOpsCookie();
    return NextResponse.json({ ok: true });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const url = process.env.OPS_AUTH_URL;
  const secret = process.env.OPS_AUTH_SECRET;
  if (!url || !secret) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 500 });
  }

  let data: { ok?: boolean; user?: { id: string; email: string; username: string; role: string } } | null = null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    data = await r.json().catch(() => null);
  } catch {
    return NextResponse.json({ error: "Could not reach the auth service" }, { status: 502 });
  }

  if (!data?.ok || !data.user) {
    return NextResponse.json(
      { error: "Invalid email or password, or this account has no ops access." },
      { status: 401 },
    );
  }
  await setOpsCookie(data.user);
  return NextResponse.json({ ok: true });
}
