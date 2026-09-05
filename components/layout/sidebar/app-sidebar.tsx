'use client';

import * as React from 'react';
import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';

import { NavOps } from '@/components/layout/sidebar/nav-ops';
import { NavSettings } from '@/components/layout/sidebar/nav-settings';
import { BackToApp } from '@/components/layout/sidebar/back-to-app';
import { SidebarUser } from '@/components/layout/sidebar/sidebar-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { CastleMark, Crenellation } from '@/components/brand/castle-mark';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { WORKSPACES, WORKSPACE_STATUS, workspaceBySlug } from '@/lib/workspaces';
import { useActiveWorkspaceStore, ALL_WORKSPACES } from '@/store/active-workspace-store';
import { useMyWorkspaces } from '@/hooks/use-my-workspaces';

// Top-left workspace switcher: scopes the whole console to one workspace (or
// "All workspaces"). The selection lives in the persisted active-workspace store.
// Only workspaces the current user may access are listed; until the permission
// list loads (or if it fails), we fall back to showing all six.
function WorkspaceSwitcher() {
   const active = useActiveWorkspaceStore((s) => s.active);
   const setActive = useActiveWorkspaceStore((s) => s.setActive);
   const current = workspaceBySlug(active);
   const { slugs } = useMyWorkspaces();

   const visible = slugs ? WORKSPACES.filter((w) => slugs.includes(w.slug)) : WORKSPACES;

   return (
      <Select value={active} onValueChange={setActive}>
         <SelectTrigger className="h-8 w-full text-xs" aria-label="Active workspace">
            <SelectValue>
               <span className="flex items-center gap-2">
                  <span
                     className={`size-2 shrink-0 rounded-full ${
                        current ? WORKSPACE_STATUS[current.status] : 'bg-muted-foreground/40'
                     }`}
                  />
                  {current ? current.name : 'All workspaces'}
               </span>
            </SelectValue>
         </SelectTrigger>
         <SelectContent>
            <SelectItem value={ALL_WORKSPACES}>
               <span className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                  All workspaces
               </span>
            </SelectItem>
            {visible.map((w) => (
               <SelectItem key={w.slug} value={w.slug}>
                  <span className="flex items-center gap-2">
                     <span
                        className={`size-2 shrink-0 rounded-full ${WORKSPACE_STATUS[w.status]}`}
                     />
                     {w.name}
                  </span>
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
   const pathname = usePathname();
   const { orgId } = useParams<{ orgId: string }>();
   const isSettings = pathname.includes('/settings');
   return (
      <Sidebar collapsible="offcanvas" {...props}>
         <SidebarHeader>
            {isSettings ? (
               <BackToApp />
            ) : (
               <div className="px-1 pt-1.5">
                  <Link
                     href={`/${orgId || 'shortcastle'}/workspaces`}
                     className="flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-sidebar-accent/50"
                     title="All workspaces"
                  >
                     <CastleMark className="size-7 rounded-md" />
                     <div className="flex flex-col leading-none">
                        <span className="text-sm font-semibold">Shortcastle Ops</span>
                        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                           Operations console
                        </span>
                     </div>
                  </Link>
                  <div className="mt-3 px-1">
                     <WorkspaceSwitcher />
                  </div>
                  <Crenellation className="mt-2" />
               </div>
            )}
         </SidebarHeader>
         <SidebarContent>{isSettings ? <NavSettings /> : <NavOps />}</SidebarContent>
         <SidebarFooter>
            <SidebarUser />
         </SidebarFooter>
      </Sidebar>
   );
}
