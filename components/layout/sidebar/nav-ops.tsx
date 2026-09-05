'use client';

import { useMemo, useState } from 'react';
import {
   CircleDot,
   LayoutDashboard,
   UserRound,
   Box,
   FileText,
   Server,
   Settings,
   Radio,
   Sparkles,
   CalendarDays,
   Workflow,
   ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
   SidebarMenuBadge,
   SidebarMenuSub,
   SidebarMenuSubButton,
   SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { VIEWS } from '@/components/common/views/saved-views';
import { useIssuesStore } from '@/store/issues-store';
import { useActiveWorkspaceStore, ALL_WORKSPACES } from '@/store/active-workspace-store';
import { status as STATUSES } from '@/mock-data/status';

// Status buckets shown under "All tasks" — derived from the status list so the
// sidebar counts and the click-through filter always agree.
const BUCKETS: { name: string; color: string; ids: string[] }[] = [
   {
      name: 'To-do',
      color: '#99a2b2',
      ids: STATUSES.filter((s) => ['unstarted', 'backlog', 'triage'].includes(s.category)).map(
         (s) => s.id
      ),
   },
   {
      name: 'In Progress',
      color: '#f2c94c',
      ids: STATUSES.filter((s) => s.category === 'started' && s.id !== 'technical-review').map(
         (s) => s.id
      ),
   },
   { name: 'In Review', color: '#5e6ad2', ids: ['technical-review'] },
   {
      name: 'Completed',
      color: '#4cb782',
      ids: STATUSES.filter((s) => s.category === 'completed').map((s) => s.id),
   },
];

// A URL that opens All tasks with the status filter pre-applied (bazza/ui shape,
// read from ?filters= by the filter store).
function statusFilterHref(base: string, ids: string[]): string {
   const model = [
      {
         columnId: 'status',
         type: 'option',
         operator: ids.length > 1 ? 'is any of' : 'is',
         values: ids,
      },
   ];
   return `${base}?filters=${encodeURIComponent(JSON.stringify(model))}`;
}

// Real ops nav. Dashboard leads; "All tasks" expands into per-status counts,
// all scoped to the active workspace (matching the rest of the console).
export function NavOps() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'shortcastle'}`;
   const pathname = usePathname();

   const issues = useIssuesStore((s) => s.issues);
   const projects = useIssuesStore((s) => s.projects);
   const active = useActiveWorkspaceStore((s) => s.active);

   const allTasksUrl = `${base}/team/CORE/all`;

   const { taskChildren, projectCount } = useMemo(() => {
      const scoped =
         active === ALL_WORKSPACES ? issues : issues.filter((i) => i.workspace === active);
      const children = BUCKETS.map((b) => ({
         name: b.name,
         color: b.color,
         count: scoped.filter((i) => b.ids.includes(i.status.id)).length,
         href: statusFilterHref(allTasksUrl, b.ids),
      }));
      const projectCount =
         active === ALL_WORKSPACES
            ? projects.length
            : projects.filter((p) => p.workspace === active).length;
      return { taskChildren: children, projectCount };
   }, [issues, projects, active, allTasksUrl]);
   const counts = { projectCount };
   const [tasksOpen, setTasksOpen] = useState(true);

   const flatItems = [
      { name: 'Dashboard', icon: LayoutDashboard, url: `${base}/dashboard` },
      { name: 'My Tasks', icon: UserRound, url: `${base}/my-issues` },
      { name: 'Daily Update', icon: CalendarDays, url: `${base}/daily` },
      { name: 'Projects', icon: Box, url: `${base}/projects`, badge: counts.projectCount },
      { name: 'Cadences', icon: Radio, url: `${base}/cadences` },
      { name: 'Workflows', icon: Workflow, url: `${base}/workflows` },
      { name: 'Knowledge', icon: Sparkles, url: `${base}/knowledge` },
      { name: 'Docs', icon: FileText, url: `${base}/docs` },
      { name: 'Infra', icon: Server, url: `${base}/infra` },
      { name: 'Settings', icon: Settings, url: `${base}/settings/preferences` },
   ];

   const activeMark = (url: string) => (
      <motion.span
         layoutId="ops-nav-active"
         className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-primary"
         transition={{ type: 'spring', stiffness: 500, damping: 34 }}
         key={url}
      />
   );

   return (
      <>
         <SidebarGroup>
            <SidebarMenu>
               {/* Dashboard — leads */}
               {(() => {
                  const url = `${base}/dashboard`;
                  const isActive = pathname === url || pathname.startsWith(url);
                  return (
                     <SidebarMenuItem className="relative">
                        {isActive && activeMark(url)}
                        <SidebarMenuButton asChild isActive={isActive}>
                           <Link href={url}>
                              <LayoutDashboard className="size-4" />
                              <span>Dashboard</span>
                           </Link>
                        </SidebarMenuButton>
                     </SidebarMenuItem>
                  );
               })()}

               {/* All tasks — collapsible with per-status counts */}
               {(() => {
                  const isActive = pathname === allTasksUrl || pathname.startsWith(allTasksUrl);
                  return (
                     <SidebarMenuItem>
                        <div className="relative">
                           {isActive && activeMark(allTasksUrl)}
                           <SidebarMenuButton asChild isActive={isActive} className="pr-8">
                              <Link href={allTasksUrl}>
                                 <CircleDot className="size-4" />
                                 <span>All tasks</span>
                              </Link>
                           </SidebarMenuButton>
                           <button
                              onClick={() => setTasksOpen((v) => !v)}
                              aria-label={tasksOpen ? 'Collapse tasks' : 'Expand tasks'}
                              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                           >
                              <ChevronRight
                                 className={`size-3.5 transition-transform ${tasksOpen ? 'rotate-90' : ''}`}
                              />
                           </button>
                        </div>
                        {tasksOpen && (
                           <SidebarMenuSub>
                              {taskChildren.map((c) => (
                                 <SidebarMenuSubItem key={c.name}>
                                    <SidebarMenuSubButton asChild>
                                       <Link href={c.href}>
                                          <span
                                             className="size-1.5 shrink-0 rounded-[3px]"
                                             style={{ backgroundColor: c.color }}
                                          />
                                          <span className="flex-1">{c.name}</span>
                                          <span className="tabular-nums text-muted-foreground">
                                             {c.count}
                                          </span>
                                       </Link>
                                    </SidebarMenuSubButton>
                                 </SidebarMenuSubItem>
                              ))}
                           </SidebarMenuSub>
                        )}
                     </SidebarMenuItem>
                  );
               })()}

               {/* Remaining items */}
               {flatItems
                  .filter((i) => i.name !== 'Dashboard')
                  .map((item) => {
                     const isActive = pathname === item.url || pathname.startsWith(item.url);
                     return (
                        <SidebarMenuItem key={item.name} className="relative">
                           {isActive && activeMark(item.url)}
                           <SidebarMenuButton asChild isActive={isActive}>
                              <Link href={item.url}>
                                 <item.icon className="size-4" />
                                 <span>{item.name}</span>
                              </Link>
                           </SidebarMenuButton>
                           {typeof item.badge === 'number' && item.badge > 0 && (
                              <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                           )}
                        </SidebarMenuItem>
                     );
                  })}
            </SidebarMenu>
         </SidebarGroup>

         <SidebarGroup>
            <SidebarGroupLabel>Views</SidebarGroupLabel>
            <SidebarMenu>
               {VIEWS.map((v) => {
                  const url = `${base}/views/${v.key}`;
                  return (
                     <SidebarMenuItem key={v.key}>
                        <SidebarMenuButton asChild isActive={pathname === url}>
                           <Link href={url}>
                              <v.icon className="size-4" />
                              <span>{v.name}</span>
                           </Link>
                        </SidebarMenuButton>
                     </SidebarMenuItem>
                  );
               })}
            </SidebarMenu>
         </SidebarGroup>
      </>
   );
}
