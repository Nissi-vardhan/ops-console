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
import { Input } from '@/components/ui/input';
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

   // Add-a-user form state.
   const [nu, setNu] = useState<{
      email: string;
      username: string;
      role: Role;
      mode: 'password' | 'google';
   }>({ email: '', username: '', role: 'member', mode: 'password' });
   const [creating, setCreating] = useState(false);
   const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null);

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

   const createUser = async () => {
      setCreating(true);
      setError(null);
      setCreated(null);
      try {
         const r = await fetch('/api/ops/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nu),
         });
         const d = await r.json().catch(() => ({}));
         if (!r.ok) throw new Error(d?.error || 'Could not create the user.');
         setCreated({ email: nu.email, password: d.generated_password ?? null });
         setNu({ email: '', username: '', role: 'member', mode: 'password' });
         await load();
      } catch (e) {
         setError((e as Error).message);
      } finally {
         setCreating(false);
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

         {canManage && (
            <SettingsSection
               title="Add a new user"
               description="A @shortcastle.com colleague who signs in with Google, or an external person with a one-time password."
            >
               <SettingsCard>
                  <div className="flex flex-col gap-3 p-4">
                     {created && (
                        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                           <div className="font-medium text-emerald-700 dark:text-emerald-300">
                              Created {created.email}
                           </div>
                           {created.password ? (
                              <div className="mt-1.5">
                                 <span className="text-muted-foreground">
                                    One-time password (shown once — copy it now):
                                 </span>
                                 <div className="mt-1 flex items-center gap-2">
                                    <code className="rounded bg-background px-2 py-1 font-mono text-sm">
                                       {created.password}
                                    </code>
                                    <Button
                                       size="sm"
                                       variant="outline"
                                       onClick={() =>
                                          navigator.clipboard?.writeText(created.password ?? '')
                                       }
                                    >
                                       Copy
                                    </Button>
                                 </div>
                                 <p className="mt-1 text-xs text-muted-foreground">
                                    They'll be asked to change it on first sign-in.
                                 </p>
                              </div>
                           ) : (
                              <p className="mt-1 text-xs text-muted-foreground">
                                 They can now sign in with their @shortcastle.com Google account.
                              </p>
                           )}
                        </div>
                     )}
                     <div className="flex flex-wrap items-center gap-2">
                        <Input
                           type="email"
                           placeholder="email@shortcastle.com"
                           value={nu.email}
                           onChange={(e) => setNu({ ...nu, email: e.target.value })}
                           className="h-9 min-w-56 flex-1"
                           disabled={creating}
                        />
                        <Input
                           placeholder="Name (optional)"
                           value={nu.username}
                           onChange={(e) => setNu({ ...nu, username: e.target.value })}
                           className="h-9 w-40"
                           disabled={creating}
                        />
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                        <Select
                           value={nu.mode}
                           onValueChange={(v) => setNu({ ...nu, mode: v as 'password' | 'google' })}
                           disabled={creating}
                        >
                           <SelectTrigger className="h-9 w-52 text-sm">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="password">External · one-time password</SelectItem>
                              <SelectItem value="google">@shortcastle · Google sign-in</SelectItem>
                           </SelectContent>
                        </Select>
                        <Select
                           value={nu.role}
                           onValueChange={(v) => setNu({ ...nu, role: v as Role })}
                           disabled={creating}
                        >
                           <SelectTrigger className="h-9 w-32 text-sm">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              {ROLES.filter((r) => r !== 'owner' || me?.role === 'owner').map(
                                 (r) => (
                                    <SelectItem key={r} value={r}>
                                       {ROLE_LABEL[r]}
                                    </SelectItem>
                                 )
                              )}
                           </SelectContent>
                        </Select>
                        <Button
                           size="sm"
                           onClick={createUser}
                           disabled={creating || !nu.email.trim()}
                        >
                           {creating ? 'Creating…' : 'Create user'}
                        </Button>
                     </div>
                     <p className="text-xs text-muted-foreground">
                        New users get ops access and no workspaces — add them to workspaces with the
                        chips above once created.
                     </p>
                  </div>
               </SettingsCard>
            </SettingsSection>
         )}
      </SettingsShell>
   );
}
