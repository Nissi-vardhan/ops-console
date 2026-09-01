import crypto from 'crypto';
import { query, queryOne } from '@/lib/db';

export interface DocShare {
   token: string;
   doc_id: string;
   allowed_emails: string[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normEmails(arr: unknown): string[] {
   if (!Array.isArray(arr)) return [];
   return Array.from(
      new Set(arr.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))
   );
}

export async function getShareByDoc(docId: string): Promise<DocShare | null> {
   return (
      (await queryOne<DocShare>(
         `SELECT token, doc_id::text, allowed_emails FROM ops_doc_shares WHERE doc_id = $1`,
         [docId]
      )) ?? null
   );
}

export async function getShareByToken(token: string): Promise<DocShare | null> {
   return (
      (await queryOne<DocShare>(
         `SELECT token, doc_id::text, allowed_emails FROM ops_doc_shares WHERE token = $1`,
         [token]
      )) ?? null
   );
}

export async function upsertShare(
   docId: string,
   emails: unknown,
   createdBy?: string | null
): Promise<DocShare> {
   const allowed = normEmails(emails);
   const existing = await getShareByDoc(docId);
   const token = existing?.token ?? crypto.randomBytes(18).toString('base64url');
   await query(
      `INSERT INTO ops_doc_shares (token, doc_id, allowed_emails, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (doc_id) DO UPDATE SET allowed_emails = EXCLUDED.allowed_emails`,
      [token, docId, allowed, createdBy ?? null]
   );
   return { token, doc_id: docId, allowed_emails: allowed };
}

export async function deleteShare(docId: string): Promise<boolean> {
   const rows = await query(`DELETE FROM ops_doc_shares WHERE doc_id = $1 RETURNING token`, [
      docId,
   ]);
   return rows.length > 0;
}

export function emailAllowed(share: DocShare, email: string): boolean {
   const e = email.trim().toLowerCase();
   return share.allowed_emails.some((x) => x.toLowerCase() === e);
}
