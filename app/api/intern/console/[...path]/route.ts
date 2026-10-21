import { NextResponse } from 'next/server';
import {
   authIntern,
   createKbDoc,
   updateKbDoc,
   InternApiError,
   type InternRow,
} from '@/lib/intern-api';
import { uploadFile } from '@/lib/intern-api-http';
import { portalCookie } from '@/lib/intern-portal';
import { query } from '@/lib/db';
import { linkDocIssue, unlinkDocIssue } from '@/lib/ops-data';
import {
   internAttachments,
   internDocs,
   internDocTasks,
   internIssueId,
   internIssues,
   internOwnsDoc,
   internTaskDocs,
} from '@/lib/intern-console';

// The console's data API in intern mode (SC-430). On the intern host the middleware sends
// /api/ops/* and /api/auth here. ONLY the routes below exist; everything else is 404. Each
// answer is limited to the signed-in intern's own tasks and docs (see lib/intern-console.ts).
// Hidden on purpose: ratings and reviews, progress log, journey, comments, sessions, members.

type Ctx = { params: Promise<{ path: string[] }> };

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
const notFound = () => json({ error: 'Not found' }, 404);

function onInternHost(request: Request) {
   const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
   const internHost = (process.env.INTERN_API_HOST || '').toLowerCase();
   return !!internHost && host === internHost;
}

async function handle(request: Request, ctx: Ctx, method: string): Promise<Response> {
   if (!onInternHost(request)) return notFound();
   const p = (await ctx.params).path ?? [];
   const route = p.join('/');

   // Sign out works without a session.
   if (route === 'auth' && method === 'POST') {
      const res = json({ ok: true });
      res.headers.set('Set-Cookie', portalCookie(null));
      return res;
   }

   // Changes must come from this site's own pages (the cookie is SameSite=Strict as well).
   if (method !== 'GET') {
      const origin = request.headers.get('origin');
      const host = request.headers.get('host');
      if (!origin || !host || new URL(origin).host !== host)
         return json({ error: 'Forbidden' }, 403);
   }
   const intern = await authIntern(request, { originChecked: true });
   if (!intern) return json({ error: 'Unauthorized' }, 401);
   try {
      return (await dispatch(request, intern, method, p)) ?? notFound();
   } catch (e) {
      if (e instanceof InternApiError) return json({ error: e.message }, e.status);
      console.error('[intern-console]', e);
      return json({ error: 'internal error' }, 500);
   }
}

async function dispatch(
   request: Request,
   intern: InternRow,
   method: string,
   p: string[]
): Promise<Response | null> {
   const [a, b, c] = p;
   const url = new URL(request.url);
   const me = { id: intern.id, email: '', username: intern.name, role: 'intern' };

   if (method === 'GET') {
      if (p.length === 1 && a === 'me') return json({ user: me });
      if (p.length === 2 && a === 'me' && b === 'workspaces')
         return json({ workspaces: [intern.workspace] });
      if (p.length === 1 && a === 'members') return json({ members: [me] });
      if (p.length === 1 && a === 'projects') return json({ projects: [] });
      if (p.length === 1 && (a === 'notifications' || a === 'comments' || a === 'sessions'))
         return json({ notifications: [], comments: [], sessions: [] });
      if (p.length === 1 && a === 'issues') return json({ issues: await internIssues(intern) });
      if (a === 'issues' && b) {
         const id = await internIssueId(intern, decodeURIComponent(b));
         if (!id) return notFound();
         if (p.length === 2) {
            const [issue] = await internIssues(intern, id);
            return json({ issue, steps: [], byPhase: {}, children: [] });
         }
         if (p.length === 3 && c === 'steps') return json({ steps: [], byPhase: {} });
         if (p.length === 3 && c === 'links')
            return json({ docs: await internTaskDocs(intern, id) });
         if (p.length === 3 && c === 'intern-updates')
            return json({
               updates: await query(
                  `SELECT kind, text, at, $3::text AS intern FROM ops_intern_updates
                    WHERE issue_id = $1 AND intern_id = $2 ORDER BY at`,
                  [id, intern.id, intern.name]
               ),
            });
         return null;
      }
      if (p.length === 1 && a === 'attachments') {
         const issueRef = url.searchParams.get('issue');
         const docRef = url.searchParams.get('doc');
         if (issueRef) {
            const id = await internIssueId(intern, issueRef);
            if (!id) return notFound();
            return json({
               attachments: await internAttachments(intern, { issueId: id }),
               storageConfigured: true,
            });
         }
         if (docRef && (await internOwnsDoc(intern, docRef)))
            return json({
               attachments: await internAttachments(intern, { docId: docRef }),
               storageConfigured: true,
            });
         return notFound();
      }
      if (p.length === 1 && a === 'docs') return json({ docs: await internDocs(intern) });
      if (a === 'docs' && b) {
         if (!(await internOwnsDoc(intern, b))) return notFound();
         if (p.length === 2) return json({ doc: (await internDocs(intern, b))[0] });
         if (p.length === 3 && c === 'links')
            return json({ issues: await internDocTasks(intern, b) });
         if (p.length === 3 && c === 'share') return json({ share: null });
         if (p.length === 3 && c === 'review') {
            const [d] = await internDocs(intern, b);
            return json({ stage: d?.review_stage ?? null, reviews: [], can_promote: false });
         }
         return null;
      }
      return null;
   }

   if (method === 'POST' && p.length === 1 && a === 'attachments') {
      const form = await request.formData().catch(() => null);
      const issueRef = (form?.get('issue_id') as string) || '';
      const docRef = (form?.get('doc_id') as string) || '';
      if (issueRef) {
         const id = await internIssueId(intern, issueRef);
         if (!id) return notFound();
         const [t] = await internIssues(intern, id);
         if (t && ['done', 'canceled'].includes(String(t.status_id)))
            return json({ error: 'this task is finished' }, 409);
         const f = await uploadFile(request, intern, { issue_id: id }, form);
         return json({ attachment: { id: f.id, filename: f.name, size: f.size } });
      }
      if (docRef && (await internOwnsDoc(intern, docRef))) {
         const f = await uploadFile(request, intern, { doc_id: docRef }, form);
         return json({ attachment: { id: f.id, filename: f.name, size: f.size } });
      }
      return notFound();
   }

   if (method === 'POST' && p.length === 1 && a === 'docs') {
      const body = await request.json().catch(() => ({}));
      const d = await createKbDoc(intern, body ?? {});
      return json({ doc: (await internDocs(intern, d.id))[0] }, 201);
   }
   if (method === 'PATCH' && p.length === 2 && a === 'docs') {
      if (!(await internOwnsDoc(intern, b))) return notFound();
      const body = await request.json().catch(() => ({}));
      await updateKbDoc(intern, b, body ?? {});
      return json({ doc: (await internDocs(intern, b))[0] });
   }

   // Same, from the doc's side ({ issue }).
   if (
      (method === 'POST' || method === 'DELETE') &&
      p.length === 3 &&
      a === 'docs' &&
      c === 'links'
   ) {
      const body = await request.json().catch(() => ({}));
      const ref =
         (typeof body?.issue === 'string' ? body.issue : '') || url.searchParams.get('issue') || '';
      const id = ref ? await internIssueId(intern, ref.trim()) : null;
      if (!id || !(await internOwnsDoc(intern, b))) return notFound();
      if (method === 'POST') await linkDocIssue(b, id);
      else await unlinkDocIssue(b, id);
      return json({ ok: true, issues: await internDocTasks(intern, b) });
   }

   // Link / unlink one of their docs and one of their tasks.
   if (
      (method === 'POST' || method === 'DELETE') &&
      p.length === 3 &&
      a === 'issues' &&
      c === 'links'
   ) {
      const id = await internIssueId(intern, decodeURIComponent(b));
      const body = await request.json().catch(() => ({}));
      const doc = typeof body?.doc === 'string' ? body.doc : '';
      if (!id || !(await internOwnsDoc(intern, doc))) return notFound();
      if (method === 'POST') await linkDocIssue(doc, id);
      else await unlinkDocIssue(doc, id);
      return json({ ok: true, docs: await internTaskDocs(intern, id) });
   }
   return null;
}

export const GET = (r: Request, ctx: Ctx) => handle(r, ctx, 'GET');
export const POST = (r: Request, ctx: Ctx) => handle(r, ctx, 'POST');
export const PATCH = (r: Request, ctx: Ctx) => handle(r, ctx, 'PATCH');
export const DELETE = (r: Request, ctx: Ctx) => handle(r, ctx, 'DELETE');
