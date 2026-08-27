import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { canOps, normalizeRole } from "@/lib/rbac";
import { setOpsCookie, clearOpsCookie } from "@/lib/ops-session";

// Login for the ops console — now verified LOCALLY against the ops DB (opsdb),
// fully independent of the tracker. Owns its own accounts + RBAC.
interface Row {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: string;
  ops_access: boolean;
  active: boolean;
}

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

  const user = await query<Row>(
    "SELECT id, email, username, password_hash, role, ops_access, active FROM users WHERE email = $1",
    [email],
  ).then((r) => r[0] ?? null);

  // Same generic failure for bad email / bad password / inactive / no ops access.
  const ok = user && user.active !== false && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password, or this account has no ops access." }, { status: 401 });
  }
  const role = normalizeRole(user.role);
  if (!canOps({ role, ops_access: user.ops_access === true, email: user.email })) {
    return NextResponse.json({ error: "Invalid email or password, or this account has no ops access." }, { status: 401 });
  }

  await setOpsCookie({ id: user.id, email: user.email, username: user.username, role });
  return NextResponse.json({ ok: true });
}
