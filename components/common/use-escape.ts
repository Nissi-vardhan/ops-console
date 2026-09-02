import { useEffect } from 'react';

/** Call `handler` when Escape is pressed (while `active`). For modals/overlays. */
export function useEscape(handler: () => void, active = true): void {
   useEffect(() => {
      if (!active) return;
      const onKey = (e: KeyboardEvent) => {
         if (e.key === 'Escape') handler();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, [handler, active]);
}
