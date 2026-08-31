import { cn } from '@/lib/utils';

/**
 * The rook — Shortcastle's mark. "Short castle" is the chess notation O-O
 * (kingside castling), and the rook is the piece that castles. The crenellated
 * silhouette is reused as the app's one signature shape: brand tile, login,
 * empty states. Drawn as rects so it stays crisp at any size and inherits
 * currentColor (white on the green tile, muted on empty states).
 */
export function Rook({ className }: { className?: string }) {
   return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
         <path d="M5 4h2.6v2.1H5zM10.7 4h2.6v2.1h-2.6zM16.4 4h2.6v2.1h-2.6z" />
         <rect x="5" y="5.9" width="14" height="2.3" />
         <path d="M6.9 8.2h10.2l-1.5 7.5H8.4z" />
         <rect x="6" y="15.4" width="12" height="2.2" />
         <rect x="4.2" y="17.4" width="15.6" height="2.5" rx="0.5" />
      </svg>
   );
}

/**
 * Brand tile — the rook on the Shortcastle green. Sizes to its container box.
 */
export function CastleMark({
   className,
   rookClassName,
}: {
   className?: string;
   rookClassName?: string;
}) {
   return (
      <div
         className={cn(
            'flex items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground',
            className
         )}
      >
         <Rook className={cn('h-[62%] w-[62%]', rookClassName)} />
      </div>
   );
}

/**
 * A row of merlons — the rook's battlement, borrowed as a quiet 3px rule.
 * Used once or twice (sidebar header, login) to sign the surface without noise.
 */
export function Crenellation({ className }: { className?: string }) {
   return (
      <div
         aria-hidden
         className={cn('h-[3px] w-full', className)}
         style={{
            background:
               'repeating-linear-gradient(90deg, var(--sidebar-primary) 0 7px, transparent 7px 14px)',
            maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
            opacity: 0.6,
         }}
      />
   );
}
