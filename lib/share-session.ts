import { SignJWT, jwtVerify } from 'jose';

// Short-lived proof that a viewer verified an allowed Google identity for a
// given share token. Signed with AUTH_SECRET (same secret as the ops session,
// different claims). Stored in the `share_access` cookie.

export const SHARE_COOKIE = 'share_access';
const MAX_AGE = 60 * 60 * 12; // 12h

function secret(): Uint8Array {
   const s = process.env.AUTH_SECRET;
   if (!s || s.length < 16) throw new Error('AUTH_SECRET is not set (min 16 chars)');
   return new TextEncoder().encode(s);
}

export async function mintShareToken(token: string, email: string): Promise<string> {
   return new SignJWT({ t: token, email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${MAX_AGE}s`)
      .sign(secret());
}

/** Returns the verified email if the cookie proves access to this token. */
export async function readShareToken(
   jwt: string | undefined,
   token: string
): Promise<string | null> {
   if (!jwt) return null;
   try {
      const { payload } = await jwtVerify(jwt, secret());
      return payload.t === token ? String(payload.email ?? '') : null;
   } catch {
      return null;
   }
}

export const SHARE_MAX_AGE = MAX_AGE;
