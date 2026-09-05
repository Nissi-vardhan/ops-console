'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Boxes, Box, ArrowRight, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { useIssuesStore } from '@/store/issues-store';
import { useActiveWorkspaceStore } from '@/store/active-workspace-store';
import { Issue } from '@/mock-data/issues';
import { Stagger, Item } from '@/components/motion';
import { WORKSPACES, WORKSPACE_STATUS } from '@/lib/workspaces';
import { useMyWorkspaces } from '@/hooks/use-my-workspaces';

const isOpen = (i: Issue) => i.status.category !== 'completed' && i.status.category !== 'canceled';

export function WorkspacesView() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'shortcastle'}`;
   const router = useRouter();
   const setActive = useActiveWorkspaceStore((s) => s.setActive);
   const projects = useIssuesStore((s) => s.projects);
   const issues = useIssuesStore((s) => s.issues);
   const { slugs } = useMyWorkspaces();

   // Clicking a card enters that workspace: scope the console, then go to All tasks.
   const enterWorkspace = (slug: string) => {
      setActive(slug);
      router.push(`${base}/team/CORE/all`);
   };

   const cards = useMemo(
      () =>
         // Show only the workspaces the current user may access. Until the
         // permission list loads (or if it fails) fall back to all six.
         WORKSPACES.filter((ws) => (slugs ? slugs.includes(ws.slug) : true)).map((ws) => {
            const tagged = projects
               .filter((p) => p.workspace === ws.slug)
               .sort((a, b) => a.name.localeCompare(b.name));
            const mine = issues.filter((i) => i.project?.workspace === ws.slug);
            return {
               ws,
               tagged,
               openIssues: mine.filter(isOpen).length,
               totalIssues: mine.length,
            };
         }),
      [projects, issues, slugs]
   );

   return (
      <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
         <PageHeader
            icon={Boxes}
            title="Workspaces"
            subtitle="The six Shortcastle products — each rolls up its tagged projects and their issues."
         />

         <Stagger className="grid gap-4 md:grid-cols-2">
            {cards.map(({ ws, tagged, openIssues, totalIssues }) => (
               <Item
                  key={ws.slug}
                  hover
                  className="flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/50"
               >
                  <div
                     role="button"
                     tabIndex={0}
                     onClick={() => enterWorkspace(ws.slug)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                           e.preventDefault();
                           enterWorkspace(ws.slug);
                        }
                     }}
                     className="flex h-full cursor-pointer flex-col outline-none"
                  >
                     <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                           <span className="flex size-7 items-center justify-center rounded-md bg-primary/15">
                              <Boxes className="size-4 text-primary" />
                           </span>
                           <span className="font-medium">{ws.name}</span>
                        </div>
                        <span
                           className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${WORKSPACE_STATUS[ws.status]}`}
                        >
                           {ws.status}
                        </span>
                     </div>

                     <p className="mt-2 text-xs text-muted-foreground">{ws.blurb}</p>

                     {/* counts */}
                     <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded-md bg-muted/50 px-2 py-0.5 text-muted-foreground">
                           {tagged.length} {tagged.length === 1 ? 'project' : 'projects'}
                        </span>
                        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-500">
                           {openIssues} open
                        </span>
                        <span className="rounded-md bg-muted/50 px-2 py-0.5 text-muted-foreground">
                           {totalIssues} total
                        </span>
                     </div>

                     {/* tagged projects */}
                     {tagged.length > 0 ? (
                        <div className="mt-3 space-y-1 border-t pt-3">
                           {tagged.slice(0, 5).map((p) => (
                              <Link
                                 key={p.id}
                                 href={`${base}/project/${p.id}/overview`}
                                 onClick={(e) => e.stopPropagation()}
                                 className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                 <Box className="size-3 shrink-0" />
                                 <span className="truncate">{p.name}</span>
                              </Link>
                           ))}
                           {tagged.length > 5 && (
                              <div className="pl-5 text-[11px] text-muted-foreground">
                                 +{tagged.length - 5} more
                              </div>
                           )}
                        </div>
                     ) : (
                        <div className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">
                           No projects tagged yet — tag one from the New project dialog.
                        </div>
                     )}

                     {/* footer: knowledge base */}
                     <div className="mt-3 flex items-center justify-between border-t pt-3">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                           <BookOpen className="size-3" /> {ws.docTitle}
                        </span>
                        <Link
                           href={`${base}/docs`}
                           onClick={(e) => e.stopPropagation()}
                           className="inline-flex items-center gap-1 text-[11px] text-primary transition-colors hover:underline"
                        >
                           Knowledge base <ArrowRight className="size-3" />
                        </Link>
                     </div>
                  </div>
               </Item>
            ))}
         </Stagger>
      </div>
   );
}
