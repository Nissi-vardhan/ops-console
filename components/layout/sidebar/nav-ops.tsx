'use client';

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
} from '@/components/ui/sidebar';
import { VIEWS } from '@/components/common/views/saved-views';

// Real ops nav. Grows as each ops surface is wired to live data.
export function NavOps() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'shortcastle'}`;
   const pathname = usePathname();
   const items = [
      { name: 'All tasks', icon: CircleDot, url: `${base}/team/CORE/all` },
      { name: 'My Tasks', icon: UserRound, url: `${base}/my-issues` },
      { name: 'Dashboard', icon: LayoutDashboard, url: `${base}/dashboard` },
      { name: 'Daily Update', icon: CalendarDays, url: `${base}/daily` },
      { name: 'Projects', icon: Box, url: `${base}/projects` },
      { name: 'Cadences', icon: Radio, url: `${base}/cadences` },
      { name: 'Workflows', icon: Workflow, url: `${base}/workflows` },
      { name: 'Knowledge', icon: Sparkles, url: `${base}/knowledge` },
      { name: 'Docs', icon: FileText, url: `${base}/docs` },
      { name: 'Infra', icon: Server, url: `${base}/infra` },
      { name: 'Settings', icon: Settings, url: `${base}/settings/preferences` },
   ];
   return (
      <>
         <SidebarGroup>
            <SidebarMenu>
               {items.map((item) => {
                  const active = pathname === item.url || pathname.startsWith(item.url);
                  return (
                     <SidebarMenuItem key={item.name} className="relative">
                        {active && (
                           <motion.span
                              layoutId="ops-nav-active"
                              className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-primary"
                              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                           />
                        )}
                        <SidebarMenuButton asChild isActive={active}>
                           <Link href={item.url}>
                              <item.icon className="size-4" />
                              <span>{item.name}</span>
                           </Link>
                        </SidebarMenuButton>
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
