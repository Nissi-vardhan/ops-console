// Single source of truth for the six fixed Shortcastle workspaces (products).
// A project is tagged to a workspace via its `workspace` slug; a workspace view
// then rolls up its tagged projects and their issues.

export type WorkspaceStatus =
   'active' | 'needs-review' | 'experimental' | 'deprecated' | 'archived';

export interface Workspace {
   slug: string;
   name: string;
   blurb: string;
   status: WorkspaceStatus;
   docTitle: string;
}

export const WORKSPACES: Workspace[] = [
   {
      slug: 'chesslang',
      name: 'Chesslang',
      blurb: 'Chess-learning platform — webinars → Chesslang One $9 funnel, WhatsApp, CIE/FIDE, ads.',
      status: 'active',
      docTitle: 'Chesslang — Knowledge Base',
   },
   {
      slug: 'prolearnr',
      name: 'ProLearnr',
      blurb: 'Coach marketplace + coach-onboarding + WhatsApp AI (AI paused pending Tier-0).',
      status: 'needs-review',
      docTitle: 'ProLearnr — Knowledge Base',
   },
   {
      slug: 'bytechess',
      name: 'ByteChess',
      blurb: 'Projector-ready chess mini-tools brand (pre-launch).',
      status: 'experimental',
      docTitle: 'ByteChess — Knowledge Base',
   },
   {
      slug: 'chessmethod',
      name: 'ChessMethod',
      blurb: 'Curriculum + proctored certification (chessmethod.io); earliest stage.',
      status: 'experimental',
      docTitle: 'ChessMethod — Knowledge Base',
   },
   {
      slug: 'trainerdb',
      name: 'TrainerDB',
      blurb: 'Chess-coach database / admin registry (staging live on Hetzner).',
      status: 'active',
      docTitle: 'TrainerDB — Knowledge Base',
   },
   {
      slug: 'shortcastle',
      name: 'Shortcastle',
      blurb: 'Parent org + shared infra: dashboards, n8n, Periskope, Zoho, servers.',
      status: 'active',
      docTitle: 'Shortcastle — Knowledge Base',
   },
];

// Tailwind chip classes per status, with dark: variants so they read in both themes.
export const WORKSPACE_STATUS: Record<WorkspaceStatus, string> = {
   'active': 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
   'needs-review': 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
   'experimental': 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
   'deprecated': 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
   'archived': 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
};

export function workspaceBySlug(slug: string | null | undefined): Workspace | undefined {
   if (!slug) return undefined;
   return WORKSPACES.find((w) => w.slug === slug);
}
