'use client';

import { createContext, useContext, useEffect } from 'react';
import { setIssuesReadOnly } from '@/store/issues-store';

// Intern mode (SC-430): the console served on the intern host to a signed-in intern. Set by the
// root layout from the request's host; screens use it to hide everything but the intern's
// own tasks and docs. (The server enforces the same limits; this only shapes the screens.)
const InternModeContext = createContext(false);

export function InternModeProvider({
   value,
   children,
}: {
   value: boolean;
   children: React.ReactNode;
}) {
   if (value && typeof window !== 'undefined') setIssuesReadOnly(true);
   useEffect(() => {
      setIssuesReadOnly(value);
   }, [value]);
   return <InternModeContext.Provider value={value}>{children}</InternModeContext.Provider>;
}

export const useInternMode = () => useContext(InternModeContext);

/** Neutral mark for the intern host (no company logo). */
export function TasksMark({ className }: { className?: string }) {
   return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
         <rect width="16" height="16" rx="4" fill="#2563eb" />
         <path d="M4 8.5l2.5 2.5L12 5.5" stroke="white" strokeWidth="2" fill="none" />
      </svg>
   );
}
