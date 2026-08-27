'use client';

import { CircleDot, LayoutDashboard, UserRound, Settings } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';

// Real ops nav. Grows as each ops surface is wired to live data.
export function NavOps() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'lndev-ui'}`;
   const pathname = usePathname();
   const items = [
      { name: 'Issues', icon: CircleDot, url: `${base}/team/CORE/all` },
      { name: 'My Issues', icon: UserRound, url: `${base}/my-issues` },
      { name: 'Dashboard', icon: LayoutDashboard, url: `${base}/dashboard` },
      { name: 'Settings', icon: Settings, url: `${base}/settings/preferences` },
   ];
   return (
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
   );
}
