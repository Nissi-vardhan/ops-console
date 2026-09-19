import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';

// A readable, reasonably strong one-time password for provisioned accounts.
export function generatePassword(): string {
   const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
   let out = '';
   for (let i = 0; i < 16; i++) out += alphabet[randomInt(alphabet.length)];
   return out;
}

// Issue a fresh one-time password and force a change on next sign-in. Returns the
// plaintext once (never stored) or null when the user doesn't exist.
export async function resetUserPassword(id: string): Promise<string | null> {
   const generated = generatePassword();
   const hash = await bcrypt.hash(generated, 12);
   const rows = await query<{ id: string }>(
      'UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2 RETURNING id',
      [hash, id]
   );
   return rows.length ? generated : null;
}
