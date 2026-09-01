// Verify a Google Identity Services credential (an ID token JWT) via Google's
// tokeninfo endpoint, and gate on our OAuth client id. The client id is public
// by design (it's embedded in the sign-in button), so a single NEXT_PUBLIC_ var
// serves both the browser button and this server-side audience check.

export function googleClientId(): string {
   return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
}

export function googleConfigured(): boolean {
   return !!googleClientId();
}

export interface GoogleIdentity {
   email: string;
}

export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentity | null> {
   const clientId = googleClientId();
   if (!clientId || !credential) return null;
   try {
      const r = await fetch(
         `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
         { cache: 'no-store' }
      );
      if (!r.ok) return null;
      const info = (await r.json()) as {
         aud?: string;
         email?: string;
         email_verified?: string | boolean;
         exp?: string;
      };
      if (info.aud !== clientId) return null;
      if (info.email_verified !== 'true' && info.email_verified !== true) return null;
      if (info.exp && Number(info.exp) * 1000 < Date.now()) return null;
      if (!info.email) return null;
      return { email: info.email.toLowerCase() };
   } catch {
      return null;
   }
}
