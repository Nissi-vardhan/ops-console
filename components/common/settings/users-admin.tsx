'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserRound } from 'lucide-react';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SettingsCard, SettingsSection, SettingsShell } from './shared';
import { ROLES, ROLE_LABEL, type Role } from '@/lib/rbac';
import { WORKSPACES } from '@/lib/workspaces';

interface AdminUser {
   id: string;
   email: string;
   username: string;
   role: string;
   ops_access: boolean;
   active: boolean;
}
interface Membership {
   user_id: string;
   workspace: string;
   role: string;
}
interface Me {
   id: string;
   role: string;
}

/**
 * Global user administration, shown on the "All workspaces" settings view.
 * Owner/admin can change a user's global role, toggle ops access / active, and
 * add or remove them from any workspace. Creating brand-new accounts is a
 * separate (auth-sensitive) flow.
 */
export default function UsersAdmin() {
   const [me, setMe] = useState<Me | null>(null);
   const [users, setUsers] = useState<AdminUser[]>([]);
   const [memberships, setMemberships] = useState<Membership[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [busy, setBusy] = useState<string | null>(null);

   const load = useCallback(async () => {
      setError(null);
      try {
         const [meRes, usersRes] = await Promise.all([
            fetch('/api/ops/me', { cache: 'no-store' }),
            fetch('/api/ops/users', { cache: 'no-store' }),
         ]);
         setMe((await meRes.json().catch(() => null))?.user ?? null);
         if (usersRes.status === 403) {
            setError('forbidden');
            return;
         }
         const d = await usersRes.json().catch(() => null);
         setUsers(Array.isArray(d?.users) ? d.users : []);
         setMemberships(Array.isArray(d?.memberships) ? d.memberships : []);
      } catch {
         setError('Failed to load users.');
      } finally {
         setLoading(false);
      }
   }, []);
   useEffect(() => {
      void load();
   }, [load]);

   const canManage = me?.role === 'owner' || me?.role === 'admin';
   const wsByUser = useMemo(() => {
      const m: Record<string, Set<string>> = {};
      for (const x of memberships) (m[x.user_id] ??= new Set()).add(x.workspace);
      return m;
   }, [memberships]);

   const patchUser = async (id: string, body: Record<string, unknown>) => {
      setBusy(id);
      setError(null);
      try {
         const r = await fetch(`/api/ops/users/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
         });
         const d = await r.json().catch(() => ({}));
         if (!r.ok) throw new Error(d?.error || 'Update failed.');
         await load();
      } catch (e) {
         setError((e as Error).message);
      } finally {
         setBusy(null);
      }
   };

   const toggleWorkspace = async (user: AdminUser, slug: string, isMember: boolean) => {
      setBusy(user.id);
      setError(null);
      try {
         const r = isMember
            ? await fetch(
                 `/api/ops/workspaces/${slug}/members?user_id=${encodeURIComponent(user.id)}`,
                 { method: 'DELETE' }
              )
            : await fetch(`/api/ops/workspaces/${slug}/members`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ user_id: user.id, role: 'member' }),
              });
         if (!r.ok) throw new Error('Could not update workspace access.');
         await load();
      } catch (e) {
         setError((e as Error).message);
      } finally {
         setBusy(null);
      }
   };

   if (error === 'forbidden') {
      return (
         <SettingsShell title="Users" description="Manage everyone with access to the console.">
            <SettingsCard>
               <div className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4" />
                  Only an owner or admin can manage users. Ask an admin for access.
               </div>
            </SettingsCard>
         </SettingsShell>
      );
   }

   return (
      <SettingsShell
         title="Users"
         description="Everyone with console access — global role, ops access, and workspace membership."
      >
         {error && error !== 'forbidden' && <p className="text-sm text-red-500">{error}</p>}
         <SettingsSection
            title={`All users${users.length ? ` · ${users.length}` : ''}`}
            description={
               canManage
                  ? 'Change a role, toggle access, or add someone to workspaces.'
                  : 'Read-only — ask an owner/admin to change access.'
            }
         >
            <SettingsCard>
               {loading ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading users…</div>
               ) : users.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No users.</div>
               ) : (
                  <div className="divide-y">
                     {users.map((u) => {
                        const mine = wsByUser[u.id] ?? new Set<string>();
                        const disabled = busy === u.id || !canManage;
                        return (
                           <div key={u.id} className="flex flex-col gap-3 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                 <div className="flex min-w-0 items-center gap-2">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                       <UserRound className="size-4 text-muted-foreground" />
                                    </span>
                                    <div className="min-w-0">
                                       <div className="flex items-center gap-2">
                                          <span className="truncate text-sm font-medium">
                                             {u.username}
                                          </span>
                                          {!u.active && (
                                             <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                                inactive
                                             </span>
                                          )}
                                       </div>
                                       <span className="block truncate text-xs text-muted-foreground">
                                          {u.email}
                                       </span>
                                    </div>
                                 </div>
                                 <div className="flex flex-wrap items-center gap-2">
                                    <Select
                                       value={ROLES.includes(u.role as Role) ? u.role : 'member'}
                                       onValueChange={(v) => patchUser(u.id, { role: v })}
                                       disabled={disabled}
                                    >
                                       <SelectTrigger className="h-8 w-28 text-xs">
                                          <SelectValue />
                                       </SelectTrigger>
                                       <SelectContent>
                                          {ROLES.map((r) => (
                                             <SelectItem key={r} value={r}>
                                                {ROLE_LABEL[r]}
                                             </SelectItem>
                                          ))}
                                       </SelectContent>
                                    </Select>
                                    <Button
                                       size="sm"
                                       variant={u.ops_access ? 'secondary' : 'outline'}
                                       disabled={disabled}
                                       onClick={() =>
                                          patchUser(u.id, { ops_access: !u.ops_access })
                                       }
                                       title="Ops console access"
                                    >
                                       {u.ops_access ? 'Ops ✓' : 'No ops'}
                                    </Button>
                                    <Button
                                       size="sm"
                                       variant="outline"
                                       disabled={disabled}
                                       onClick={() => patchUser(u.id, { active: !u.active })}
                                    >
                                       {u.active ? 'Deactivate' : 'Reactivate'}
                                    </Button>
                                 </div>
                              </div>
                              {/* workspace membership chips */}
                              <div className="flex flex-wrap gap-1.5 pl-10">
                                 {WORKSPACES.map((w) => {
                                    const isMember = mine.has(w.slug);
                                    return (
                                       <button
                                          key={w.slug}
                                          disabled={disabled}
                                          onClick={() => toggleWorkspace(u, w.slug, isMember)}
                                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ${
                                             isMember
                                                ? 'border-primary/40 bg-primary/12 text-primary'
                                                : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                                          }`}
                                          title={
                                             isMember ? `Remove from ${w.name}` : `Add to ${w.name}`
                                          }
                                       >
                                          {w.name}
                                       </button>
                                    );
                                 })}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Add a new user"
            description="Invite someone who isn't in the console yet — a colleague's @shortcastle.com Google account, or an external person with a generated password."
         >
            <SettingsCard>
               <div className="p-4 text-sm text-muted-foreground">
                  Coming next — creating brand-new accounts is an auth-sensitive step being wired up
                  separately. For now, add existing users to workspaces above.
               </div>
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
