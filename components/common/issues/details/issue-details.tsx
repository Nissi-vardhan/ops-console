'use client';

import { getIssueDetail } from '@/mock-data/issue-details';
import { useIssuesStore } from '@/store/issues-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { IssuePropertiesPanel } from './issue-properties-panel';
import { JourneyPanel } from './journey-panel';
import { TaskSessions } from './task-sessions';
import { Comments } from '@/components/common/comments';

/**
 * Issue detail page: rich description, sub-issues, activity feed and a
 * properties sidebar — Linear-style.
 */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const { issues } = useIssuesStore();

   const issue = useMemo(
      () => issues.find((candidate) => candidate.identifier === issueId),
      [issues, issueId]
   );

   const detail = useMemo(() => (issue ? getIssueDetail(issue) : null), [issue]);

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
      'text-sm leading-relaxed text-foreground/90 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-3';

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-8 sm:px-8 sm:py-10">
               <h1 className="text-2xl font-semibold leading-tight text-balance sm:text-3xl">
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

               {/* Journey — ordered, checkable steps across the 5 work phases */}
               <JourneyPanel issueId={issue.id} />

               {/* Progress log — appended by `ops note` / agents as they work */}
               {issue.progress?.trim() && (
                  <div className="mt-8">
                     <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Progress
                     </h2>
                     <div className="rounded-xl border bg-container p-3">
                        <div className={prose}>
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {issue.progress}
                           </ReactMarkdown>
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

         {/* Properties sidebar */}
         <aside className="hidden lg:block w-80 shrink-0 border-l h-full overflow-y-auto bg-container px-5 py-6">
            <IssuePropertiesPanel issue={issue} detail={detail} />
         </aside>
      </div>
   );
}
