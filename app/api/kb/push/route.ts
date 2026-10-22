import { NextResponse } from 'next/server';
import { authPushKey, deletePushedDoc, listPushed, pushDoc, PushError } from '@/lib/kb-push';

// KB push API (SC-437) for an outside team, with a push key locked to one workspace.
//   GET    /api/kb/push                 → your pushed articles and their status
//   POST   /api/kb/push  {ref,title,body,audience?}  or  {docs:[…]} (max 100)
//   DELETE /api/kb/push?ref=<ref>       → remove an article that was never live
// Nothing pushed goes live until an owner approves it.
const unauthorized = () =>
   NextResponse.json(
      { error: 'missing or invalid push key (Authorization: Bearer kbp_…)' },
      { status: 401 }
   );

function fail(e: unknown) {
   if (e instanceof PushError) return NextResponse.json({ error: e.message }, { status: e.status });
   console.error('[kb-push]', e);
   return NextResponse.json({ error: 'internal error' }, { status: 500 });
}

export async function GET(request: Request) {
   const ws = await authPushKey(request);
   if (!ws) return unauthorized();
   return NextResponse.json({ workspace: ws, docs: await listPushed(ws) });
}

export async function POST(request: Request) {
   const ws = await authPushKey(request);
   if (!ws) return unauthorized();
   const body = await request.json().catch(() => null);
   if (!body || typeof body !== 'object')
      return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
   const items: unknown[] = Array.isArray(body.docs) ? body.docs : [body];
   if (!items.length) return NextResponse.json({ error: 'no docs' }, { status: 400 });
   if (items.length > 100)
      return NextResponse.json({ error: 'at most 100 docs per request' }, { status: 400 });
   const results = [];
   for (const item of items) {
      try {
         results.push(await pushDoc(ws, (item ?? {}) as Record<string, unknown>));
      } catch (e) {
         if (!(e instanceof PushError)) return fail(e);
         const ref = (item as { ref?: unknown })?.ref;
         results.push({
            ref: typeof ref === 'string' ? ref : null,
            result: 'error',
            error: e.message,
         });
      }
   }
   const failed = results.filter((r) => r.result === 'error').length;
   return NextResponse.json(
      { workspace: ws, results, ok: results.length - failed, failed },
      { status: failed === results.length ? 400 : 200 }
   );
}

export async function DELETE(request: Request) {
   const ws = await authPushKey(request);
   if (!ws) return unauthorized();
   const ref = new URL(request.url).searchParams.get('ref') || '';
   try {
      return NextResponse.json(await deletePushedDoc(ws, ref));
   } catch (e) {
      return fail(e);
   }
}
