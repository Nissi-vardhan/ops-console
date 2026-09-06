'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useActiveWorkspaceStore, ALL_WORKSPACES } from '@/store/active-workspace-store';
import { WORKSPACES } from '@/lib/workspaces';
import { useMyWorkspaces } from '@/hooks/use-my-workspaces';

// Status → dot colour (blue/light palette; greens/ambers stay semantic).
const DOT: Record<string, string> = {
   'active': '#22c55e',
   'needs-review': '#f59e0b',
   'experimental': '#a855f7',
};

/**
 * Horizontal, scrollable workspace switcher pinned to the top of the content.
 * The active pill is an animated sliding highlight (shared layout), and the
 * selected workspace scrolls itself into view. Replaces the sidebar dropdown.
 */
export function WorkspaceBar() {
   const active = useActiveWorkspaceStore((s) => s.active);
   const setActive = useActiveWorkspaceStore((s) => s.setActive);
   const { slugs } = useMyWorkspaces();

   const visible = slugs ? WORKSPACES.filter((w) => slugs.includes(w.slug)) : WORKSPACES;
   const items = [
      { slug: ALL_WORKSPACES, name: 'All workspaces', dot: '#94a3b8' },
      ...visible.map((w) => ({ slug: w.slug, name: w.name, dot: DOT[w.status] ?? '#94a3b8' })),
   ];

   // Keep the active pill in view when it changes (e.g. from a deep link).
   const activeRef = useRef<HTMLButtonElement>(null);
   useEffect(() => {
      activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
   }, [active]);

   return (
      <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
         <div
            className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 sm:px-5 [-ms-overflow-style:none] [scrollbar-width:none]"
            style={{ scrollbarWidth: 'none' }}
         >
            {items.map((it) => {
               const isActive = active === it.slug;
               return (
                  <button
                     key={it.slug}
                     ref={isActive ? activeRef : undefined}
                     onClick={() => setActive(it.slug)}
                     className="relative shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium outline-none transition-colors"
                  >
                     {isActive && (
                        <motion.span
                           layoutId="ws-active-pill"
                           className="absolute inset-0 rounded-full bg-accent ring-1 ring-primary/20"
                           transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                        />
                     )}
                     <span
                        className={`relative z-10 flex items-center gap-2 ${
                           isActive
                              ? 'text-accent-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                        }`}
                     >
                        <span
                           className="size-1.5 shrink-0 rounded-full transition-transform"
                           style={{
                              backgroundColor: it.dot,
                              transform: isActive ? 'scale(1.25)' : 'scale(1)',
                           }}
                        />
                        {it.name}
                     </span>
                  </button>
               );
            })}
         </div>
      </div>
   );
}
