'use client';

import { CircleDot, LayoutDashboard, UserRound, Box, FileText, Server, Settings, Radio, Sparkles } from 'lucide-react';
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
      { name: 'Issues', icon: CircleDot, url: `${base}/team/CORE/all` },
      { name: 'My Issues', icon: UserRound, url: `${base}/my-issues` },
      { name: 'Dashboard', icon: LayoutDashboard, url: `${base}/dashboard` },
      { name: 'Projects', icon: Box, url: `${base}/projects` },
      { name: 'Cadences', icon: Radio, url: `${base}/cadences` },
      { name: 'Knowledge', icon: Sparkles, url: `${base}/knowledge` },
      { name: 'Docs', icon: FileText, url: `${base}/docs` },
      { name: 'Infra', icon: Server, url: `${base}/infra` },
      { name: 'Settings', icon: Settings, url: `${base}/settings/preferences` },
   ];
   return (
      <>
         <SidebarGroup>
            <SidebarMenu>
               {items.map((item) => (
                  <SidebarMenuItem key={item.name}>
                     <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(item.url)}>
                        <Link href={item.url}>
                           <item.icon className="size-4" />
                           <span>{item.name}</span>
                        </Link>
                     </SidebarMenuButton>
                  </SidebarMenuItem>
               ))}
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
