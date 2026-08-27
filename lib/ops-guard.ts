import { getOpsUser } from "@/lib/ops-session";

// Guard for /api/ops/*. Accepts EITHER the shared bearer secret
// (OPS_AUTH_SECRET — used by the `ops` CLI and server-to-server callers) OR a
// valid ops session cookie (the browser UI). Async because the session check
// reads cookies.
export async function opsAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.OPS_AUTH_SECRET;
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && token === secret) return true;
  return (await getOpsUser()) != null;
}
