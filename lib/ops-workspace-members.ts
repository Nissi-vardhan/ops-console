import { query, queryOne } from '@/lib/db';
import { WORKSPACES, workspaceBySlug } from '@/lib/workspaces';
import { ASSIGNABLE_ROLES, normalizeRole, type Role } from '@/lib/rbac';

// Per-workspace membership + RBAC data layer. A row in ops_workspace_members
// means the user can access that workspace, with a per-workspace role. Owner is
// never gated by this table — it always has access to everything.

export interface WorkspaceMember {
   user_id: string;
   username: string;
   email: string;
   role: string;
}

const ALL_SLUGS = WORKSPACES.map((w) => w.slug);

/** Slugs the given user may access. Owner (global) sees all six. */
export async function myWorkspaceSlugs(user: { id: string; role: string }): Promise<string[]> {
   if (user.role === 'owner') return [...ALL_SLUGS];
   const rows = await query<{ workspace: string }>(
      'SELECT workspace FROM ops_workspace_members WHERE user_id = $1',
      [user.id]
   );
   // Keep only slugs that are still real workspaces, in canonical order.
   const set = new Set(rows.map((r) => r.workspace));
   return ALL_SLUGS.filter((s) => set.has(s));
}

/** Members of a workspace, joined to users for display. */
export async function listWorkspaceMembers(slug: string): Promise<WorkspaceMember[]> {
   if (!workspaceBySlug(slug)) return [];
   return query<WorkspaceMember>(
      `SELECT m.user_id, u.username, u.email, m.role
       FROM ops_workspace_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace = $1 AND u.active = true
       ORDER BY u.username`,
      [slug]
   );
}

/** Is the user a member of the workspace, and with what role? */
export async function workspaceMemberRole(slug: string, userId: string): Promise<string | null> {
   const row = await queryOne<{ role: string }>(
      'SELECT role FROM ops_workspace_members WHERE workspace = $1 AND user_id = $2',
      [slug, userId]
   );
   return row?.role ?? null;
}

/** Grant/set a member's role on a workspace. Validates slug + role; upserts. */
export async function setWorkspaceMember(
   slug: string,
   userId: string,
   role: string
): Promise<WorkspaceMember | null> {
   if (!workspaceBySlug(slug)) return null;
   const normalized: Role = normalizeRole(role);
   if (!ASSIGNABLE_ROLES.includes(normalized)) return null;
   await query(
      `INSERT INTO ops_workspace_members (workspace, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace, user_id) DO UPDATE SET role = excluded.role`,
      [slug, userId, normalized]
   );
   return queryOne<WorkspaceMember>(
      `SELECT m.user_id, u.username, u.email, m.role
       FROM ops_workspace_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace = $1 AND m.user_id = $2`,
      [slug, userId]
   );
}

/** Revoke a member's access to a workspace. */
export async function removeWorkspaceMember(slug: string, userId: string): Promise<boolean> {
   const rows = await query(
      'DELETE FROM ops_workspace_members WHERE workspace = $1 AND user_id = $2 RETURNING user_id',
      [slug, userId]
   );
   return rows.length > 0;
}
