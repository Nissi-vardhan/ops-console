import { query, queryOne } from '@/lib/db';

export interface Attachment {
   id: string;
   doc_id: string | null;
   filename: string;
   content_type: string;
   size: number;
   object_key: string;
}

export async function createAttachment(a: {
   doc_id?: string | null;
   filename: string;
   content_type: string;
   size: number;
   object_key: string;
   created_by?: string | null;
}): Promise<Attachment> {
   const rows = await query<Attachment>(
      `INSERT INTO ops_attachments (doc_id, filename, content_type, size, object_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, doc_id::text, filename, content_type, size, object_key`,
      [a.doc_id ?? null, a.filename, a.content_type, a.size, a.object_key, a.created_by ?? null]
   );
   return rows[0];
}

export async function getAttachment(id: string): Promise<Attachment | null> {
   return (
      (await queryOne<Attachment>(
         `SELECT id, doc_id::text, filename, content_type, size, object_key FROM ops_attachments WHERE id = $1`,
         [id]
      )) ?? null
   );
}

export async function listAttachments(docId: string): Promise<Attachment[]> {
   return query<Attachment>(
      `SELECT id, doc_id::text, filename, content_type, size, object_key
         FROM ops_attachments WHERE doc_id = $1 ORDER BY created_at`,
      [docId]
   );
}
