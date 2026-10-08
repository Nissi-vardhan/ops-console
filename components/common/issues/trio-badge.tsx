/** Small "Trio" chip for Nissi · Arun · Jarvis tasks. */
export function TrioBadge({ className = '' }: { className?: string }) {
   return (
      <span
         title="Trio task — Nissi · Arun · Jarvis"
         className={`shrink-0 rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300 ${className}`}
      >
         Trio
      </span>
   );
}
