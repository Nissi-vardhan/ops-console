'use client';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
   Bell,
   Blocks,
   Boxes,
   KeyRound,
   LucideIcon,
   Settings,
   UserRound,
   Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

interface SettingsNavItem {
   name: string;
   /** Path under /{orgId}. */
   url: string;
   icon: LucideIcon;
}

interface SettingsNavGroup {
   label: string;
   items: SettingsNavItem[];
}

/** Settings navigation — trimmed to the sections Shortcastle actually uses.
 *  (The template's dead pages — SLAs, Initiatives, Releases, Customer requests,
 *  Emojis, and the duplicate Labels/Templates — have been removed.) */
export const settingsNav: SettingsNavGroup[] = [
   {
      label: 'Personal',
      items: [
         { name: 'Account', url: '/settings/profile', icon: UserRound },
         { name: 'Preferences', url: '/settings/preferences', icon: Settings },
         { name: 'Notifications', url: '/settings/notifications', icon: Bell },
      ],
   },
   {
      label: 'Workspace',
      items: [
         { name: 'Workspace', url: '/settings/workspace', icon: Boxes },
         { name: 'Connected accounts', url: '/settings/connected-accounts', icon: Users },
         { name: 'Integrations', url: '/settings/integrations', icon: Blocks },
      ],
   },
];

export function NavSettings() {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();

   return (
      <>
         {settingsNav.map((group) => (
            <SidebarGroup key={group.label} className="group-data-[collapsible=icon]:hidden">
               <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
               <SidebarMenu>
                  {group.items.map((item) => {
                     const href = `/${orgId}${item.url}`;
                     const isActive = pathname === href;
                     return (
                        <SidebarMenuItem key={`${group.label}-${item.name}`}>
                           <SidebarMenuButton asChild isActive={isActive}>
                              <Link href={href}>
                                 <item.icon className="size-4" />
                                 <span>{item.name}</span>
                              </Link>
                           </SidebarMenuButton>
                        </SidebarMenuItem>
                     );
                  })}
               </SidebarMenu>
            </SidebarGroup>
         ))}
      </>
   );
}
