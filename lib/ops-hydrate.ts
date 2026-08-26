import { status as STATUSES } from "@/mock-data/status";
import { priorities as PRIORITIES } from "@/mock-data/priorities";
import { labels as LABELS } from "@/mock-data/labels";
import type { Issue } from "@/mock-data/issues";
import type { User } from "@/mock-data/users";

// Raw row shapes coming from the tracker backend.
export interface RawMember {
  id: string;
  email: string;
  username: string;
  role: string;
}
export interface RawIssue {
  id: string;
  seq: number;
  identifier: string | null;
  title: string;
  description: string;
  status_id: string;
  priority_id: string;
  assignee_id: string | null;
  project_id: string | null;
  label_ids: string[];
  rank: string;
  due_date: string | null;
  created_at: string;
}

// A real Member → the User shape Circle's components expect (avatar falls back to
// initials since AvatarImage will fail on an empty url).
export function memberToUser(m: RawMember): User {
  return {
    id: m.id,
    name: m.username || m.email.split("@")[0],
    email: m.email,
    avatarUrl: "",
    status: "offline",
    role: m.role === "owner" || m.role === "admin" ? "Admin" : "Member",
    joinedDate: "",
    teamIds: [],
    timezone: "UTC",
  };
}

export function hydrateIssue(row: RawIssue, users: User[]): Issue {
  const st = STATUSES.find((s) => s.id === row.status_id) ?? STATUSES[0];
  const pr = PRIORITIES.find((p) => p.id === row.priority_id) ?? PRIORITIES[0];
  const lbls = (row.label_ids ?? [])
    .map((id) => LABELS.find((l) => l.id === id))
    .filter((l): l is (typeof LABELS)[number] => Boolean(l));
  const assignee = row.assignee_id ? users.find((u) => u.id === row.assignee_id) ?? null : null;
  return {
    id: row.id,
    identifier: row.identifier || `OPS-${row.seq}`,
    title: row.title,
    description: row.description || "",
    status: st,
    assignee,
    priority: pr,
    labels: lbls,
    createdAt: row.created_at,
    cycleId: "",
    project: undefined,
    subissues: [],
    rank: row.rank || "0|hzzzzz:",
    dueDate: row.due_date || undefined,
  };
}

// Issue field change → raw patch for the backend (Partial<Issue> carries embedded
// objects; we translate to the id columns the API stores).
export function issuePatchToRaw(patch: Partial<Issue>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  if (patch.title !== undefined) raw.title = patch.title;
  if (patch.description !== undefined) raw.description = patch.description;
  if (patch.status !== undefined) raw.status_id = patch.status.id;
  if (patch.priority !== undefined) raw.priority_id = patch.priority.id;
  if (patch.assignee !== undefined) raw.assignee_id = patch.assignee ? patch.assignee.id : null;
  if (patch.labels !== undefined) raw.label_ids = patch.labels.map((l) => l.id);
  if (patch.rank !== undefined) raw.rank = patch.rank;
  if (patch.dueDate !== undefined) raw.due_date = patch.dueDate ?? null;
  return raw;
}
