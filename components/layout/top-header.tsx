'use client';

import { Search } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggleButton } from '@/components/layout/theme-toggle-button';
import { useCommandStore } from '@/store/command-store';

/**
 * App top bar: sidebar toggle + page title on the left, a centred search that
 * opens the ⌘K command palette, and the theme toggle on the right.
 */
export function TopHeader({ title }: { title?: string }) {
   const setOpen = useCommandStore((s) => s.setOpen);
   return (
      <div className="flex h-12 w-full shrink-0 items-center gap-3 border-b px-3 sm:px-4">
         <SidebarTrigger />
         {title && <span className="shrink-0 text-sm font-medium">{title}</span>}
         <button
            type="button"
            onClick={() => setOpen(true)}
            className="mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-full border bg-muted/40 px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted/70"
            aria-label="Search"
         >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 text-left">Search anything…</span>
            <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
               ⌘K
            </kbd>
         </button>
         <ThemeToggleButton />
      </div>
   );
}
