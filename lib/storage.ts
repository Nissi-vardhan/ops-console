import { Client } from 'minio';
import type { Readable } from 'node:stream';

// S3-compatible object storage (the shared MinIO "lake"). Ops doc attachments
// live under the ops/attachments/ prefix. Configured via MINIO_* env.

let _client: Client | null = null;

function endpoint(): string {
   return process.env.MINIO_S3_ENDPOINT || process.env.MINIO_ENDPOINT || '';
}

// Dev-only fallback: STORAGE_LOCAL_DIR stores objects on disk (ignored in production).
const localDir = () =>
   process.env.NODE_ENV !== 'production' ? process.env.STORAGE_LOCAL_DIR || '' : '';

export function storageConfigured(): boolean {
   if (localDir()) return true;
   return !!endpoint() && !!process.env.MINIO_ROOT_USER && !!process.env.MINIO_ROOT_PASSWORD;
}

function client(): Client {
   if (_client) return _client;
   const u = new URL(endpoint());
   _client = new Client({
      endPoint: u.hostname,
      port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
      useSSL: u.protocol === 'https:',
      accessKey: process.env.MINIO_ROOT_USER || '',
      secretKey: process.env.MINIO_ROOT_PASSWORD || '',
   });
   return _client;
}

const bucket = () => process.env.MINIO_BUCKET || 'ops-attachments';

async function ensureBucket(): Promise<void> {
   const b = bucket();
   const exists = await client()
      .bucketExists(b)
      .catch(() => false);
   if (!exists) await client().makeBucket(b);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
   if (localDir()) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { dirname, join } = await import('node:path');
      const file = join(localDir(), key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
      return;
   }
   await ensureBucket();
   await client().putObject(bucket(), key, body, body.length, { 'Content-Type': contentType });
}

export async function getObjectStream(key: string): Promise<Readable> {
   if (localDir()) {
      const { createReadStream } = await import('node:fs');
      const { join } = await import('node:path');
      return createReadStream(join(localDir(), key));
   }
   return client().getObject(bucket(), key);
}
