import { Client } from 'minio';
import type { Readable } from 'node:stream';

// S3-compatible object storage (the shared MinIO "lake"). Ops doc attachments
// live under the ops/attachments/ prefix. Configured via MINIO_* env.

let _client: Client | null = null;

function endpoint(): string {
   return process.env.MINIO_S3_ENDPOINT || process.env.MINIO_ENDPOINT || '';
}

export function storageConfigured(): boolean {
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
   await ensureBucket();
   await client().putObject(bucket(), key, body, body.length, { 'Content-Type': contentType });
}

export async function getObjectStream(key: string): Promise<Readable> {
   return client().getObject(bucket(), key);
}
