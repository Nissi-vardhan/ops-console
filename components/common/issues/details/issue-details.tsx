'use client';

import { getIssueDetail } from '@/mock-data/issue-details';
import { useIssuesStore } from '@/store/issues-store';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { JourneyPanel } from './journey-panel';
import { InternUpdates, TaskFiles } from './task-extras';
import { TaskSessions } from './task-sessions';
import { TaskLinkedDocs } from '@/components/common/docs/doc-links';
import { Comments } from '@/components/common/comments';
import { isIssueRef } from '@/mock-data/issues';

/**
 * Issue detail page: rich description, sub-issues, activity feed and a
 * properties sidebar — Linear-style.
 */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const router = useRouter();
   const { issues } = useIssuesStore();

   // Esc closes the open task (back), unless you're typing in a field.
   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         if (e.key !== 'Escape') return;
         const el = document.activeElement as HTMLElement | null;
         if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
            el.blur();
            return;
         }
         router.back();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, [router]);

   const issue = useMemo(
      () => issues.find((candidate) => isIssueRef(candidate, issueId)),
      [issues, issueId]
   );
   // Parent / sub-tasks (one session's part of a bigger piece of work).
   const parent = useMemo(
      () => (issue?.parentId ? issues.find((c) => c.id === issue.parentId) : undefined),
      [issues, issue]
   );
   const children = useMemo(
      () => (issue ? issues.filter((c) => c.parentId === issue.id) : []),
      [issues, issue]
   );
   const childrenDone = children.filter(
      (c) => c.status.category === 'completed' || c.status.category === 'canceled'
   ).length;

   const detail = useMemo(() => (issue ? getIssueDetail(issue) : null), [issue]);
   // The task list leaves out the progress log (it's large); fetch it for this task.
   const [progress, setProgress] = useState<{ id: string; text: string } | null>(null);
   const taskId = issue?.id;
   useEffect(() => {
      if (!taskId) return;
      let live = true;
      fetch(`/api/ops/issues/${taskId}`, { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => live && d?.issue && setProgress({ id: taskId, text: d.issue.progress || '' }))
         .catch(() => {});
      return () => {
         live = false;
      };
   }, [taskId]);
   const progressText = (progress?.id === taskId ? progress?.text : '') || issue?.progress || '';

   if (!issue || !detail) {
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>Issue {issueId} not found.</p>
            <Link href={`/${orgId ?? 'shortcastle'}/team/CORE/all`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   const prose =
      'text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:[overflow-wrap:normal] [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-3';

   return (
      <div className="w-full h-full flex flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 lg:h-full lg:overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 sm:px-8 sm:py-10">
               {issue.parentIdentifier && (
                  <Link
                     href={`/${orgId ?? 'shortcastle'}/issue/${issue.parentIdentifier}`}
                     className="mb-2 inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                     ↳ Part of <span className="font-medium">{issue.parentIdentifier}</span>
                     {parent && <span className="truncate">— {parent.title}</span>}
                  </Link>
               )}
               <h1 className="text-2xl font-semibold leading-tight text-balance [overflow-wrap:anywhere] sm:text-3xl">
                  {issue.title}
               </h1>

               <div className="mt-5">
                  {issue.description?.trim() ? (
                     <div className={prose}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                           {issue.description}
                        </ReactMarkdown>
                     </div>
                  ) : (
                     <p className="text-sm text-muted-foreground">No description.</p>
                  )}
               </div>

               {/* Sub-tasks — each session's part of this piece of work */}
               {children.length > 0 && (
                  <div className="mt-8">
                     <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Sub-tasks · {childrenDone}/{children.length} done
                     </h2>
                     <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                        <div
                           className="h-full rounded-full bg-emerald-500"
                           style={{
                              width: `${Math.round((childrenDone / children.length) * 100)}%`,
                           }}
                        />
                     </div>
                     <ul className="divide-y rounded-xl border bg-container">
                        {children.map((c) => (
                           <li key={c.id}>
                              <Link
                                 href={`/${orgId ?? 'shortcastle'}/issue/${c.identifier}`}
                                 className="flex min-h-10 items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40"
                              >
                                 <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: c.status.color }}
                                    title={c.status.name}
                                 />
                                 <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                    {c.identifier}
                                 </span>
                                 <span className="min-w-0 truncate">{c.title}</span>
                                 <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                    {c.ownerSession || c.status.name}
                                 </span>
                              </Link>
                           </li>
                        ))}
                     </ul>
                  </div>
               )}

               <TaskFiles issueRef={issue.identifier} />
               <InternUpdates issueRef={issue.identifier} />

               {/* Journey — ordered, checkable steps across the 5 work phases */}
               <JourneyPanel issueId={issue.id} />

               <TaskLinkedDocs issueRef={issue.identifier} base={`/${orgId ?? 'shortcastle'}`} />

               {/* Progress log — appended by `ops note` / agents as they work */}
               {progressText.trim() && (
                  <div className="mt-8">
                     <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Progress
                     </h2>
                     <div className="rounded-xl border bg-container p-3">
                        <div className={prose}>
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{progressText}</ReactMarkdown>
                        </div>
                     </div>
                  </div>
               )}

               <TaskSessions identifier={issue.identifier} />

               <Comments
                  listUrl={`/api/ops/comments?kind=issue&id=${issue.id}`}
                  postUrl="/api/ops/comments"
                  extra={{ kind: 'issue', id: issue.id }}
               />
            </div>
         </div>

         {/* Properties sidebar (stacks under the content below lg) */}
         <aside className="w-full shrink-0 border-t bg-container px-4 py-6 sm:px-8 lg:w-80 lg:h-full lg:overflow-y-auto lg:border-t-0 lg:border-l lg:px-5">
            <IssuePropertiesPanel issue={issue} detail={detail} />
         </aside>
      </div>
   );
}
