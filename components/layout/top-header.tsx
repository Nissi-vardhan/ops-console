'use client';

import { Search } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useCommandStore } from '@/store/command-store';
import { NotificationsBell } from '@/components/layout/notifications-bell';

/**
 * App top bar: sidebar toggle + page title on the left and a centred search
 * that opens the ⌘K command palette. (Theme toggle lives in the sidebar.)
 */
export function TopHeader({ title }: { title?: string }) {
   const setOpen = useCommandStore((s) => s.setOpen);
   return (
      <div className="flex h-12 w-full min-w-0 shrink-0 items-center gap-1.5 border-b px-2 sm:gap-3 sm:px-4">
         <SidebarTrigger />
         {title && (
            <span className="min-w-0 max-w-[40%] truncate text-sm font-medium sm:max-w-none sm:shrink-0">
               {title}
            </span>
         )}
         <button
            type="button"
            onClick={() => setOpen(true)}
            className="mx-auto flex h-9 w-full min-w-0 max-w-md items-center gap-2 rounded-full border bg-muted/40 px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70"
            aria-label="Search"
         >
            <Search className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Search anything…</span>
            <kbd className="hidden rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium tracking-wide sm:inline">
               ⌘K
            </kbd>
         </button>
         <NotificationsBell />
      </div>
   );
}
