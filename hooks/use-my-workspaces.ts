import * as React from 'react';

// Fetches the workspace slugs the signed-in user may access (owner gets all six)
// from /api/ops/me/workspaces. SSR-safe: starts null (unknown) and fills after
// mount, so nothing depends on `window` at module scope.
export function useMyWorkspaces(): { slugs: string[] | null; loading: boolean } {
   const [slugs, setSlugs] = React.useState<string[] | null>(null);
   const [loading, setLoading] = React.useState(true);

   React.useEffect(() => {
      let alive = true;
      fetch('/api/ops/me/workspaces', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => {
            if (!alive) return;
            setSlugs(Array.isArray(d?.slugs) ? (d.slugs as string[]) : []);
         })
         .catch(() => {
            if (alive) setSlugs([]);
         })
         .finally(() => {
            if (alive) setLoading(false);
         });
      return () => {
         alive = false;
      };
   }, []);

   return { slugs, loading };
}
