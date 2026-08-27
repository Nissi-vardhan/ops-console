// Role-based access control. Roles map to permission sets; `ops_access` is an
// independent per-user toggle for the ops console (Segments + ops.* domain).

export type Role = "owner" | "admin" | "member" | "viewer";
export const ROLES: Role[] = ["owner", "admin", "member", "viewer"];
export const ASSIGNABLE_ROLES: Role[] = ["admin", "member", "viewer"]; // owner is not hand-assigned in the UI

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export type Perm =
  | "webinars.view"
  | "ads.view"
  | "subs.view"
  | "tools.view"
  | "docs.view"
  | "settings.manage"
  | "members.manage"
  | "rates.manage";

const ROLE_PERMS: Record<Role, Perm[]> = {
  owner: ["webinars.view", "ads.view", "subs.view", "tools.view", "docs.view", "settings.manage", "members.manage", "rates.manage"],
  admin: ["webinars.view", "ads.view", "subs.view", "tools.view", "docs.view", "settings.manage", "members.manage", "rates.manage"],
  member: ["webinars.view", "ads.view", "subs.view", "tools.view", "docs.view"],
  viewer: ["webinars.view", "subs.view"],
};

export interface Principal {
  role: Role;
  ops_access: boolean;
  email?: string;
}

export function normalizeRole(v: unknown): Role {
  return ROLES.includes(v as Role) ? (v as Role) : "member";
}

export function can(p: Principal | null | undefined, perm: Perm): boolean {
  if (!p) return false;
  return (ROLE_PERMS[p.role] ?? []).includes(perm);
}

// Ops console / Segments: owner always, or anyone explicitly granted ops_access.
export function canOps(p: Principal | null | undefined): boolean {
  return !!p && (p.role === "owner" || p.ops_access === true);
}

export const isOwner = (p?: Principal | null): boolean => p?.role === "owner";
export const isAdminOrOwner = (p?: Principal | null): boolean =>
  p?.role === "owner" || p?.role === "admin";

// Nav tab → permission that reveals it.
export const TAB_PERM: Record<"webinars" | "ads" | "subs" | "tools" | "docs", Perm> = {
  webinars: "webinars.view",
  ads: "ads.view",
  subs: "subs.view",
  tools: "tools.view",
  docs: "docs.view",
};
