import { Rook } from './castle-mark';
import { cn } from '@/lib/utils';

/**
 * Branded empty state — a faint rook over a title and a next step. An empty
 * screen is an invitation to act, so the hint always names the move to make.
 */
export function EmptyState({
   title,
   hint,
   className,
}: {
   title: string;
   hint?: string;
   className?: string;
}) {
   return (
      <div
         className={cn(
            'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
            className
         )}
      >
         <Rook className="h-9 w-9 text-muted-foreground/35" />
         <div className="space-y-1">
            <p className="text-sm font-medium text-foreground/85">{title}</p>
            {hint && <p className="mx-auto max-w-xs text-xs text-muted-foreground">{hint}</p>}
         </div>
      </div>
   );
}
