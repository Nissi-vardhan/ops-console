import { createHmac, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { query, queryOne } from '@/lib/db';

// Intern login (SC-430): username + password for the limited intern page on the intern host.
// The session cookie is signed with a key derived from AUTH_SECRET (never the console's own key),
// so an intern session can never pass as a console session. It is host-only on the intern host.

export const PORTAL_COOKIE = 'tdb_session';
const AUD = 'intern-portal';
const MAX_AGE_S = 7 * 24 * 3600;

function key(): Uint8Array {
   const s = process.env.AUTH_SECRET;
   if (!s) throw new Error('AUTH_SECRET is not set');
   return new Uint8Array(createHmac('sha256', s).update('intern-portal-v1').digest());
}

const slug = (name: string) =>
   name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 30) || 'intern';

/** No look-alike characters (0/O, 1/l/I), so it can be read out or typed from a screenshot. */
function newPassword(): string {
   const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
   const b = randomBytes(16);
   return Array.from(b, (x) => abc[x % abc.length]).join('');
}

export interface LoginInfo {
   login_name: string | null;
   enabled: boolean;
   password_set_at: string | null;
}

export async function internLoginInfo(internId: string): Promise<LoginInfo | null> {
   const r = await queryOne<{
      login_name: string | null;
      has: boolean;
      password_set_at: string | null;
   }>(
      'SELECT login_name, password_hash IS NOT NULL AS has, password_set_at FROM ops_interns WHERE id = $1',
      [internId]
   );
   return r
      ? { login_name: r.login_name, enabled: r.has, password_set_at: r.password_set_at }
      : null;
}

/** Create or reset the intern's login. Returns the new password once; only its hash is stored. */
export async function resetInternLogin(
   internId: string
): Promise<{ login_name: string; password: string } | null> {
   const n = await queryOne<{ name: string; login_name: string | null }>(
      'SELECT name, login_name FROM ops_interns WHERE id = $1',
      [internId]
   );
   if (!n) return null;
   let login = n.login_name;
   if (!login) {
      const base = slug(n.name);
      login = base;
      for (let i = 2; ; i++) {
         const taken = await queryOne(
            'SELECT 1 FROM ops_interns WHERE lower(login_name) = lower($1) AND id <> $2',
            [login, internId]
         );
         if (!taken) break;
         login = `${base}${i}`;
      }
   }
   const password = newPassword();
   await query(
      'UPDATE ops_interns SET login_name = $2, password_hash = $3, password_set_at = now() WHERE id = $1',
      [internId, login, await bcrypt.hash(password, 10)]
   );
   return { login_name: login, password };
}

/** Turn the login off; open sessions stop working at once. */
export async function disableInternLogin(internId: string): Promise<void> {
   await query(
      'UPDATE ops_interns SET password_hash = NULL, password_set_at = now() WHERE id = $1',
      [internId]
   );
}

// Best-effort per-login+IP throttle, same idea as the console login.
const MAX_FAILS = 5;
const attempts = new Map<string, { n: number; until: number }>();
// Compared against when the login doesn't exist, so a wrong username takes as long as a wrong password.
const DUMMY = bcrypt.hashSync(randomBytes(12).toString('hex'), 10);

export async function portalLogin(
   login: string,
   password: string,
   ip: string
): Promise<{ token: string } | { error: string; status: number }> {
   const k = `${login.toLowerCase()}|${ip}`;
   const rec = attempts.get(k);
   if (rec && rec.n >= MAX_FAILS && rec.until > Date.now())
      return { error: 'Too many attempts. Try again in a few minutes.', status: 429 };
   const row = await queryOne<{
      id: string;
      active: boolean;
      password_hash: string | null;
      password_set_at: string | Date;
   }>(
      'SELECT id, active, password_hash, password_set_at FROM ops_interns WHERE lower(login_name) = lower($1)',
      [login]
   );
   const ok = await bcrypt.compare(password, row?.password_hash || DUMMY);
   if (!row || !row.active || !row.password_hash || !ok) {
      const n = (rec?.n ?? 0) + 1;
      attempts.set(k, {
         n,
         until: Date.now() + Math.min(60_000 * 2 ** Math.max(0, n - MAX_FAILS), 900_000),
      });
      return { error: 'Wrong username or password.', status: 401 };
   }
   attempts.delete(k);
   const token = await new SignJWT({ pv: new Date(row.password_set_at).getTime() })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(row.id)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime(`${MAX_AGE_S}s`)
      .sign(key());
   return { token };
}

/** The intern id behind a portal session cookie, if it's still valid. */
export async function portalInternId(request: Request): Promise<string | null> {
   const cookie = request.headers.get('cookie') || '';
   const m = cookie.match(new RegExp(`(?:^|;\\s*)${PORTAL_COOKIE}=([^;]+)`));
   if (!m) return null;
   try {
      const { payload } = await jwtVerify(decodeURIComponent(m[1]), key(), { audience: AUD });
      if (!payload.sub) return null;
      const row = await queryOne<{ ok: boolean }>(
         `SELECT (active AND password_hash IS NOT NULL
                  AND floor(extract(epoch FROM password_set_at) * 1000) = $2) AS ok
            FROM ops_interns WHERE id = $1`,
         [payload.sub, Number(payload.pv)]
      );
      return row?.ok ? payload.sub : null;
   } catch {
      return null;
   }
}

export function portalCookie(token: string | null): string {
   const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
   return token
      ? `${PORTAL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_S}${secure}`
      : `${PORTAL_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
