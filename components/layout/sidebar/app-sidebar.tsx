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
               <div className="flex items-center gap-2 px-2 py-1.5">
                  <div className="flex size-7 items-center justify-center rounded-md bg-[#5e6ad2] text-[10px] font-bold text-white">
                     OPS
                  </div>
                  <span className="text-sm font-semibold">Shortcastle Ops</span>
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
