import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Gate the whole ops console behind a valid session; only /login + /api/auth
// stay open so a user can actually sign in.
const OPS_COOKIE = "ops_session";
const OPEN = ["/login", "/api/auth"];

async function hasValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const s = process.env.AUTH_SECRET;
  if (!s) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(s));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (OPEN.some((o) => path === o || path.startsWith(o + "/"))) return NextResponse.next();

  // API routes self-authorize at the handler (session OR bearer OPS_AUTH_SECRET
  // for the CLI, or SYNC_SECRET for the peer feeds) — don't blanket-gate them on
  // the session cookie here, or server-to-server callers get 401'd before the route.
  if (path.startsWith("/api/")) return NextResponse.next();

  if (await hasValidSession(req.cookies.get(OPS_COOKIE)?.value)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?)$).*)"],
};
