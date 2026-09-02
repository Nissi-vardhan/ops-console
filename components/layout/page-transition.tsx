'use client';

import { type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { easeOut } from '@/components/motion';

/** Fades + lifts the page content in on each route change. */
export function PageTransition({ children }: { children: ReactNode }) {
   const pathname = usePathname();
   const reduce = useReducedMotion();
   if (reduce) return <div className="h-full w-full">{children}</div>;
   return (
      <motion.div
         key={pathname}
         initial={{ opacity: 0, y: 8 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.26, ease: easeOut }}
         className="h-full w-full"
      >
         {children}
      </motion.div>
   );
}
