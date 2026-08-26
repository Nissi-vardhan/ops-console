import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Session for the ops console. Credentials are verified by the tracker
// (POST /api/ops-auth) which owns the accounts + RBAC; on success we mint this
// short session JWT so the middleware can gate the app.
export const OPS_COOKIE = "ops_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is not set (min 16 chars)");
  return new TextEncoder().encode(s);
}

export interface OpsUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export async function createOpsToken(u: OpsUser): Promise<string> {
  return new SignJWT({ email: u.email, username: u.username, role: u.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function setOpsCookie(u: OpsUser): Promise<void> {
  const token = await createOpsToken(u);
  const store = await cookies();
  store.set(OPS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearOpsCookie(): Promise<void> {
  const store = await cookies();
  store.delete(OPS_COOKIE);
}

export async function getOpsUser(): Promise<OpsUser | null> {
  const store = await cookies();
  const token = store.get(OPS_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      username: String(payload.username ?? ""),
      role: String(payload.role ?? "member"),
    };
  } catch {
    return null;
  }
}
