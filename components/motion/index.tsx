'use client';

import { motion, useReducedMotion, useSpring, type Variants } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';

// Shared motion vocabulary for Shortcastle Ops. One easing, one stagger rhythm,
// one spring — so every animated surface feels like the same hand. Everything
// here honours prefers-reduced-motion by rendering the static equivalent.

export const easeOut: [number, number, number, number] = [0.22, 1, 0.36, 1];

const container: Variants = {
   hidden: {},
   show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};

const item: Variants = {
   hidden: { opacity: 0, y: 12 },
   show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

/** Staggers its children in as they mount. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
   const reduce = useReducedMotion();
   if (reduce) return <div className={className}>{children}</div>;
   return (
      <motion.div className={className} variants={container} initial="hidden" animate="show">
         {children}
      </motion.div>
   );
}

/** A single staggered child. `hover` adds a subtle lift. */
export function Item({
   children,
   className,
   hover,
}: {
   children: ReactNode;
   className?: string;
   hover?: boolean;
}) {
   const reduce = useReducedMotion();
   if (reduce) return <div className={className}>{children}</div>;
   return (
      <motion.div
         className={className}
         variants={item}
         whileHover={hover ? { y: -3 } : undefined}
         transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      >
         {children}
      </motion.div>
   );
}

/** A number that springs up to its value on mount / when it changes. */
export function CountUp({ value, className }: { value: number; className?: string }) {
   const reduce = useReducedMotion();
   const spring = useSpring(0, { stiffness: 80, damping: 18, mass: 0.6 });
   const [n, setN] = useState(0);
   useEffect(() => {
      if (reduce) {
         setN(value);
         return;
      }
      spring.set(value);
      return spring.on('change', (v) => setN(Math.round(v)));
   }, [value, reduce, spring]);
   return <span className={className}>{n}</span>;
}

/** A meter that fills to `pct` from empty. */
export function Bar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
   const reduce = useReducedMotion();
   return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
         <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            transition={{ duration: 0.7, ease: easeOut, delay }}
         />
      </div>
   );
}
