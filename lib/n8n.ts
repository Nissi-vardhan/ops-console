// Server-side n8n REST client. The API key stays on the server; the ops app
// proxies a slimmed-down list to the browser. Configured via N8N_BASE_URL +
// N8N_API_KEY.

export function n8nBase(): string {
   return (process.env.N8N_BASE_URL || 'https://n8n.shortcastle.com').replace(/\/+$/, '');
}
export function n8nConfigured(): boolean {
   return !!process.env.N8N_API_KEY;
}

async function n8n<T>(path: string): Promise<T> {
   const r = await fetch(`${n8nBase()}/api/v1${path}`, {
      headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY || '', 'accept': 'application/json' },
      cache: 'no-store',
   });
   if (!r.ok) throw new Error(`n8n ${r.status}`);
   return r.json() as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface RawWorkflow {
   id: string | number;
   name: string;
   active: boolean;
   nodes?: any[];
   connections?: Record<string, any>;
   tags?: { name: string }[];
   createdAt?: string;
   updatedAt?: string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const TRIGGER_LABEL: Record<string, string> = {
   'n8n-nodes-base.webhook': 'Webhook',
   'n8n-nodes-base.scheduleTrigger': 'Schedule',
   'n8n-nodes-base.cron': 'Schedule',
   'n8n-nodes-base.formTrigger': 'Form',
   'n8n-nodes-base.emailReadImap': 'Email',
   'n8n-nodes-base.executeWorkflowTrigger': 'Sub-workflow',
   'n8n-nodes-base.errorTrigger': 'Error',
   'n8n-nodes-base.manualTrigger': 'Manual',
   '@n8n/n8n-nodes-langchain.mcpTrigger': 'MCP',
};
const TRIGGER_PRIORITY = [
   'Webhook',
   'Schedule',
   'Form',
   'Email',
   'MCP',
   'Sub-workflow',
   'Manual',
   'Error',
];

function triggerOf(nodes: { type?: string }[]): string {
   const found = new Set<string>();
   for (const n of nodes) {
      const label = TRIGGER_LABEL[n.type ?? ''];
      if (label) found.add(label);
   }
   for (const p of TRIGGER_PRIORITY) if (found.has(p)) return p;
   return '—';
}

export interface WorkflowSummary {
   id: string;
   name: string;
   active: boolean;
   trigger: string;
   tags: string[];
   nodeCount: number;
   createdAt: string | null;
   updatedAt: string | null;
   lastRun: { at: string; status: string } | null;
}

let cache: { at: number; data: WorkflowSummary[] } | null = null;

export async function listWorkflows(): Promise<WorkflowSummary[]> {
   if (cache && Date.now() - cache.at < 30_000) return cache.data;
   const wf = await n8n<{ data: RawWorkflow[] }>('/workflows?limit=250');

   const lastMap: Record<string, { at: string; status: string }> = {};
   try {
      const ex = await n8n<{
         data: { workflowId: string; startedAt?: string; stoppedAt?: string; status: string }[];
      }>('/executions?limit=250');
      for (const e of ex.data ?? []) {
         const wid = String(e.workflowId);
         if (!lastMap[wid])
            lastMap[wid] = { at: e.startedAt || e.stoppedAt || '', status: e.status };
      }
   } catch {
      /* executions optional */
   }

   const data: WorkflowSummary[] = (wf.data ?? []).map((w) => ({
      id: String(w.id),
      name: w.name,
      active: !!w.active,
      trigger: triggerOf(w.nodes ?? []),
      tags: (w.tags ?? []).map((t) => t.name),
      nodeCount: (w.nodes ?? []).length,
      createdAt: w.createdAt ?? null,
      updatedAt: w.updatedAt ?? null,
      lastRun: lastMap[String(w.id)] ?? null,
   }));
   cache = { at: Date.now(), data };
   return data;
}

export interface WorkflowDetail {
   id: string;
   name: string;
   active: boolean;
   tags: string[];
   nodes: { name: string; type: string; position: [number, number]; disabled?: boolean }[];
   connections: Record<string, { main?: { node: string }[][] }>;
}

export async function getWorkflow(id: string): Promise<WorkflowDetail> {
   const w = await n8n<RawWorkflow>(`/workflows/${encodeURIComponent(id)}`);
   return {
      id: String(w.id),
      name: w.name,
      active: !!w.active,
      tags: (w.tags ?? []).map((t) => t.name),
      nodes: (w.nodes ?? []).map((n) => ({
         name: n.name,
         type: n.type,
         position: n.position ?? [0, 0],
         disabled: n.disabled,
      })),
      connections: (w.connections ?? {}) as WorkflowDetail['connections'],
   };
}
