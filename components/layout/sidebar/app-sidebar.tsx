'use client';

import * as React from 'react';
import { LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { NavOps } from '@/components/layout/sidebar/nav-ops';
import { NavSettings } from '@/components/layout/sidebar/nav-settings';
import { NavTeamsSettings } from '@/components/layout/sidebar/nav-teams-settings';
import { BackToApp } from '@/components/layout/sidebar/back-to-app';
import { Button } from '@/components/ui/button';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { CastleMark, Crenellation } from '@/components/brand/castle-mark';

function signOut() {
   fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sign_out' }),
   }).finally(() => {
      window.location.href = '/login';
   });
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
   const pathname = usePathname();
   const isSettings = pathname.includes('/settings');
   return (
      <Sidebar collapsible="offcanvas" {...props}>
         <SidebarHeader>
            {isSettings ? (
               <BackToApp />
            ) : (
               <div className="px-1 pt-1.5">
                  <div className="flex items-center gap-2 px-1">
                     <CastleMark className="size-7 rounded-md" />
                     <div className="flex flex-col leading-none">
                        <span className="text-sm font-semibold">Shortcastle Ops</span>
                        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                           O-O
                        </span>
                     </div>
                  </div>
                  <Crenellation className="mt-2" />
               </div>
            )}
         </SidebarHeader>
         <SidebarContent>
            {isSettings ? (
               <>
                  <NavSettings />
                  <NavTeamsSettings />
               </>
            ) : (
               <NavOps />
            )}
         </SidebarContent>
         <SidebarFooter>
            <Button
               variant="ghost"
               size="sm"
               className="w-full justify-start gap-2 text-muted-foreground"
               onClick={signOut}
            >
               <LogOut className="size-4" /> Sign out
            </Button>
         </SidebarFooter>
      </Sidebar>
   );
}
