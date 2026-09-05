import { getPool, query } from '@/lib/db';

// Persistent workspace tags for n8n workflows. Workflows themselves live in n8n
// (re-synced constantly, no ops row), so their workspace tag is stored here in a
// separate mapping keyed by the n8n workflow id — see ops_workflow_workspace.

interface WorkflowWorkspaceRow {
   workflow_id: string;
   workspace: string;
}

/** All workflow → workspace tags as { [workflowId]: workspaceSlug }. */
export async function getWorkflowWorkspaceMap(): Promise<Record<string, string>> {
   const rows = await query<WorkflowWorkspaceRow>(
      `SELECT workflow_id, workspace FROM ops_workflow_workspace`
   );
   const map: Record<string, string> = {};
   for (const r of rows) map[r.workflow_id] = r.workspace;
   return map;
}

/** Tag one workflow to a workspace, or clear its tag when workspace is null. */
export async function setWorkflowWorkspace(id: string, workspace: string | null): Promise<void> {
   if (workspace === null) {
      await query(`DELETE FROM ops_workflow_workspace WHERE workflow_id = $1`, [id]);
      return;
   }
   await query(
      `INSERT INTO ops_workflow_workspace (workflow_id, workspace)
       VALUES ($1, $2)
       ON CONFLICT (workflow_id)
       DO UPDATE SET workspace = excluded.workspace, updated_at = now()`,
      [id, workspace]
   );
}

/** Upsert many workflow → workspace tags in one transaction. Returns the count. */
export async function bulkSetWorkflowWorkspace(map: Record<string, string>): Promise<number> {
   const entries = Object.entries(map);
   if (entries.length === 0) return 0;
   const client = await getPool().connect();
   try {
      await client.query('BEGIN');
      for (const [id, workspace] of entries) {
         await client.query(
            `INSERT INTO ops_workflow_workspace (workflow_id, workspace)
             VALUES ($1, $2)
             ON CONFLICT (workflow_id)
             DO UPDATE SET workspace = excluded.workspace, updated_at = now()`,
            [id, workspace]
         );
      }
      await client.query('COMMIT');
   } catch (e) {
      await client.query('ROLLBACK');
      throw e;
   } finally {
      client.release();
   }
   return entries.length;
}
