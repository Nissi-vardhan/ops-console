import { NextResponse } from 'next/server';
import { reindexEmbeddings, embeddingsCount } from '@/lib/ops-index';
import { opsAuthorized, requireRole } from '@/lib/ops-guard';

// Build/refresh semantic-recall embeddings for docs + issues. Idempotent:
// skips sources whose text hasn't changed (source_hash). Safe to run nightly.
export async function POST(request: Request) {
   const denied = await requireRole(request, 'admin');
   if (denied) return denied;
   try {
      const result = await reindexEmbeddings();
      return NextResponse.json({ ok: true, ...result });
   } catch (e) {
      return NextResponse.json(
         { ok: false, error: String(e instanceof Error ? e.message : e) },
         { status: 500 }
      );
   }
}

export async function GET(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   return NextResponse.json({ embeddings: await embeddingsCount() });
}
