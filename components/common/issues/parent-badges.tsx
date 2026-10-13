import Link from 'next/link';

/** "↳ CL-400" — this task is one part of a bigger task. */
export function ParentChip({
   orgId,
   parent,
   link = true,
}: {
   orgId: string;
   parent: string;
   /** false when already inside another link (no nested <a>). */
   link?: boolean;
}) {
   if (!link)
      return (
         <span
            title={`Part of ${parent}`}
            className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
         >
            ↳ {parent}
         </span>
      );
   return (
      <Link
         href={`/${orgId}/issue/${parent}`}
         title={`Part of ${parent}`}
         onClick={(e) => e.stopPropagation()}
         className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
         ↳ {parent}
      </Link>
   );
}

/** "2/4 parts" — progress of a parent's sub-tasks. */
export function ChildrenPill({ done, total }: { done: number; total: number }) {
   const complete = done >= total;
   return (
      <span
         title={`${done} of ${total} sub-tasks done`}
         className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${complete ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'}`}
      >
         {done}/{total} parts
      </span>
   );
}
