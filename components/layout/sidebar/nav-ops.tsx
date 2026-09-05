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

// Real ops nav. Dashboard leads; "All tasks" expands into per-status counts,
// all scoped to the active workspace (matching the rest of the console).
export function NavOps() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'shortcastle'}`;
   const pathname = usePathname();

   const issues = useIssuesStore((s) => s.issues);
   const projects = useIssuesStore((s) => s.projects);
   const active = useActiveWorkspaceStore((s) => s.active);

   const counts = useMemo(() => {
      const scoped =
         active === ALL_WORKSPACES ? issues : issues.filter((i) => i.workspace === active);
      const inCat = (cats: string[]) =>
         scoped.filter((i) => cats.includes(i.status.category)).length;
      const todo = inCat(['unstarted', 'backlog', 'triage']);
      const review = scoped.filter((i) => i.status.id === 'technical-review').length;
      const inProgress = scoped.filter((i) => i.status.category === 'started').length - review;
      const done = inCat(['completed']);
      const projectCount =
         active === ALL_WORKSPACES
            ? projects.length
            : projects.filter((p) => p.workspace === active).length;
      return {
         total: scoped.length,
         todo,
         inProgress: Math.max(0, inProgress),
         review,
         done,
         projectCount,
      };
   }, [issues, projects, active]);

   const allTasksUrl = `${base}/team/CORE/all`;
   const taskChildren = [
      { name: 'To-do', count: counts.todo, color: '#99a2b2' },
      { name: 'In Progress', count: counts.inProgress, color: '#f2c94c' },
      { name: 'In Review', count: counts.review, color: '#5e6ad2' },
      { name: 'Completed', count: counts.done, color: '#4cb782' },
   ];
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
                     <SidebarMenuItem className="relative">
                        {isActive && activeMark(allTasksUrl)}
                        <SidebarMenuButton asChild isActive={isActive}>
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
                        {tasksOpen && (
                           <SidebarMenuSub>
                              {taskChildren.map((c) => (
                                 <SidebarMenuSubItem key={c.name}>
                                    <SidebarMenuSubButton asChild>
                                       <Link href={allTasksUrl}>
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
