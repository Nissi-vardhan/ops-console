// The task "Journey": 5 ordered phases every ops task moves through. Blocked and
// Canceled remain orthogonal status flags (on ops_issues.status_id), NOT phases.
// Shared by the server (ops-data) and the browser UI, so keep it framework-free.

export const JOURNEY_PHASES = ['plan', 'prepare', 'execute', 'verify', 'done'] as const;
export type Phase = (typeof JOURNEY_PHASES)[number];

export const STEP_STATUSES = ['pending', 'doing', 'done', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const PHASE_INDEX: Record<string, number> = {
   plan: 0,
   prepare: 1,
   execute: 2,
   verify: 3,
   done: 4,
};

export const PHASE_LABEL: Record<Phase, string> = {
   plan: 'Plan',
   prepare: 'Prepare',
   execute: 'Execute',
   verify: 'Verify',
   done: 'Done',
};

export function normPhase(p: unknown): Phase {
   const v = String(p ?? '').toLowerCase();
   return (JOURNEY_PHASES as readonly string[]).includes(v) ? (v as Phase) : 'plan';
}

export function normStepStatus(s: unknown): StepStatus {
   const v = String(s ?? '').toLowerCase();
   return (STEP_STATUSES as readonly string[]).includes(v) ? (v as StepStatus) : 'pending';
}

// A step no longer needs attention once it's done or explicitly skipped.
export const stepIsComplete = (status: string): boolean =>
   status === 'done' || status === 'skipped';
