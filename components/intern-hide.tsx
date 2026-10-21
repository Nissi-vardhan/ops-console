'use client';

import { useInternMode } from '@/components/intern-mode';

/** Renders its children everywhere except in intern mode (SC-430). */
export function NotForInterns({ children }: { children: React.ReactNode }) {
   return useInternMode() ? null : <>{children}</>;
}
