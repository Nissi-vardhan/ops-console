'use client';

import { CircleDot, Settings } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';

// Minimal, real-data ops nav. The all-issues board carries both list and kanban
// views. (Demo features — inbox/reviews/agent/initiatives/projects/views/teams —
// are intentionally omitted since they only had mock data.)
export function NavOps() {
   const { orgId } = useParams<{ orgId: string }>();
   const base = `/${orgId || 'lndev-ui'}`;
   const pathname = usePathname();
   const items = [
      { name: 'Issues', icon: CircleDot, url: `${base}/team/CORE/all` },
      { name: 'Settings', icon: Settings, url: `${base}/settings/preferences` },
   ];
   return (
      <SidebarGroup>
         <SidebarMenu>
            {items.map((item) => (
               <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)}>
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
