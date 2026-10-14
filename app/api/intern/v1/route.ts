import { NextResponse } from 'next/server';

// GET /api/intern/v1 — endpoint index (no auth needed; lists routes only).
export async function GET() {
   return NextResponse.json({
      version: 'v1',
      auth: 'Authorization: Bearer <your API key>',
      timezone: 'All *_ist fields are Asia/Kolkata (IST); *_at fields are ISO-8601 UTC.',
      endpoints: [
         'GET  /api/intern/v1/me',
         'GET  /api/intern/v1/tasks?status=open|all',
         'GET  /api/intern/v1/tasks/{id}',
         'POST /api/intern/v1/tasks/{id}/start      {"text"?}',
         'POST /api/intern/v1/tasks/{id}/progress   {"text"}',
         'POST /api/intern/v1/tasks/{id}/stuck      {"text": reason}',
         'POST /api/intern/v1/tasks/{id}/unstuck    {"text"?}',
         'POST /api/intern/v1/tasks/{id}/close      {"text": summary}',
         'POST /api/intern/v1/tasks/{id}/files      multipart file',
         'GET  /api/intern/v1/kb?scope=mine|all&q=',
         'POST /api/intern/v1/kb                    {"title","body","category"?}',
         'GET  /api/intern/v1/kb/{id}',
         'PATCH /api/intern/v1/kb/{id}              {"title"?,"body"?,"category"?}',
         'POST /api/intern/v1/kb/{id}/files         multipart file',
         'GET  /api/intern/v1/files/{id}',
      ],
   });
}
