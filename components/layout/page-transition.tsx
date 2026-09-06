'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion, useAnimationControls } from 'motion/react';
import { easeOut } from '@/components/motion';

/**
 * Fades the page content in on each route change WITHOUT remounting the subtree.
 * Driving a keyless `motion.div` with animation controls (instead of `key={pathname}`)
 * replays the opacity fade on navigation while keeping children mounted, so per-view
 * state/effects and mount-fetches are not re-run cold on every navigation.
 */
export function PageTransition({ children }: { children: ReactNode }) {
   const pathname = usePathname();
   const reduce = useReducedMotion();
   const controls = useAnimationControls();

   useEffect(() => {
      if (reduce) return;
      controls.set({ opacity: 0 });
      controls.start({ opacity: 1, transition: { duration: 0.26, ease: easeOut } });
   }, [pathname, reduce, controls]);

   if (reduce) return <div className="h-full w-full">{children}</div>;
   return (
      <motion.div animate={controls} className="h-full w-full">
         {children}
      </motion.div>
   );
}
