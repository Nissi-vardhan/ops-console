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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
   const pathname = usePathname();
   const { orgId } = useParams<{ orgId: string }>();
   const isSettings = pathname.includes('/settings');
   return (
      <Sidebar collapsible="icon" {...props}>
         <SidebarHeader>
            {isSettings ? (
               <BackToApp />
            ) : (
               <div className="px-1 pt-1.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:pt-0">
                  <Link
                     href={`/${orgId || 'shortcastle'}/workspaces`}
                     className="flex items-center gap-2 rounded-md px-1 transition-colors hover:bg-sidebar-accent/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                     title="All workspaces"
                  >
                     <CastleMark className="size-7 shrink-0 rounded-md" />
                     <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
                        <span className="text-sm font-semibold">Shortcastle Ops</span>
                        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                           Operations console
                        </span>
                     </div>
                  </Link>
                  <Crenellation className="mt-2 group-data-[collapsible=icon]:hidden" />
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
