import { NextResponse } from 'next/server';
import { accessibleWorkspaces, opsAuthorized } from '@/lib/ops-guard';
import { getOpsUser } from '@/lib/ops-session';
import { askKb } from '@/lib/ops-ask';
import { WORKSPACES } from '@/lib/workspaces';

// POST /api/ops/ask { question, workspace: <slug>|'all', staging?: boolean, audience?: 'support'|'marketing' }
// support = only what bots may say; marketing = also the team-only marketing articles.
// Answers from KB articles only (production unless staging is set). Signed-in team
// members and the CLI bearer; members only search the workspaces they belong to.
export async function POST(request: Request) {
   if (!(await opsAuthorized(request)))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
   const body = await request.json().catch(() => null);
   const question = typeof body?.question === 'string' ? body.question.trim() : '';
   if (question.length < 3) return NextResponse.json({ error: 'Ask a question' }, { status: 400 });
   if (question.length > 2000)
      return NextResponse.json({ error: 'Question is too long' }, { status: 400 });
   const workspace = typeof body?.workspace === 'string' ? body.workspace : 'all';
   if (workspace !== 'all' && !WORKSPACES.some((w) => w.slug === workspace))
      return NextResponse.json({ error: 'Unknown product' }, { status: 400 });
   const allowed = await accessibleWorkspaces();
   if (workspace !== 'all' && allowed && !allowed.includes(workspace))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
   const user = await getOpsUser();
   try {
      const res = await askKb({
         question,
         workspace,
         staging: body?.staging === true,
         allowed,
         askedBy: user?.username || user?.email || 'session',
         audience: body?.audience === 'marketing' ? 'marketing' : 'support',
      });
      return NextResponse.json(res);
   } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
   }
}
