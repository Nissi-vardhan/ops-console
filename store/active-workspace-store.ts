import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Sentinel for "no workspace scope" — show everything (today's behavior).
export const ALL_WORKSPACES = '__all';

interface ActiveWorkspaceState {
   /** Active workspace slug, or '__all' for no scoping. */
   active: string;
   setActive: (slug: string) => void;
}

/**
 * The workspace switcher's selection: a workspace slug (see lib/workspaces.ts)
 * or '__all'. Persisted to localStorage so the whole console stays scoped to
 * the chosen workspace across sessions. Zustand's persist middleware reads
 * localStorage only on the client (after mount), so the SSR/first render always
 * sees the '__all' default — no `window` at module/render scope.
 */
export const useActiveWorkspaceStore = create<ActiveWorkspaceState>()(
   persist(
      (set) => ({
         active: ALL_WORKSPACES,
         setActive: (active) => set({ active }),
      }),
      { name: 'ops-active-workspace' }
   )
);

/**
 * Does an item (by its workspace tag) belong in the current scope? '__all'
 * shows everything; any specific slug keeps only items tagged to it. Items with
 * no workspace (null/undefined) show only under "All workspaces".
 */
export function inActiveWorkspace(
   itemWorkspace: string | null | undefined,
   active: string
): boolean {
   if (active === ALL_WORKSPACES) return true;
   return itemWorkspace === active;
}
