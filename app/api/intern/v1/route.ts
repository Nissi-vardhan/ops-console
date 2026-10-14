import { NextResponse } from 'next/server';

// GET /v1 — endpoint index (no key needed; lists routes only).
export async function GET() {
   return NextResponse.json({
      version: 'v1',
      auth: 'Authorization: Bearer <your API key>',
      timezone: 'All *_ist fields are Asia/Kolkata (IST); *_at fields are ISO-8601 UTC.',
      endpoints: [
         'GET   /v1/me',
         'GET   /v1/tasks?status=open|all',
         'GET   /v1/tasks/{id}',
         'POST  /v1/tasks/{id}/start      {"text"?}',
         'POST  /v1/tasks/{id}/progress   {"text"}',
         'POST  /v1/tasks/{id}/stuck      {"text": reason}',
         'POST  /v1/tasks/{id}/unstuck    {"text"?}',
         'POST  /v1/tasks/{id}/close      {"text": summary}',
         'POST  /v1/tasks/{id}/files      multipart file',
         'GET   /v1/kb?scope=mine|all&q=',
         'POST  /v1/kb                    {"title","body","category"?}',
         'GET   /v1/kb/{id}',
         'PATCH /v1/kb/{id}               {"title"?,"body"?,"category"?}',
         'POST  /v1/kb/{id}/files         multipart file',
         'GET   /v1/files/{id}',
      ],
   });
}
