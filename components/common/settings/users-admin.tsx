'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserRound, Pencil } from 'lucide-react';
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
import UserAccessDialog, { type AdminUser, type Membership } from './user-access-dialog';

interface Me {
   id: string;
   role: string;
}

/**
 * Global user administration, shown on the "All workspaces" settings view.
 * Clicking a user opens UserAccessDialog, where an owner/admin manages the
 * global role, console access, active flag, workspace membership and password
 * in one place. Creating brand-new accounts is the form below.
 */
export default function UsersAdmin() {
   const [me, setMe] = useState<Me | null>(null);
   const [users, setUsers] = useState<AdminUser[]>([]);
   const [memberships, setMemberships] = useState<Membership[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [editing, setEditing] = useState<AdminUser | null>(null);

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
                  ? 'Click a user to manage their role, console access, workspaces and password.'
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
                        const role = ROLES.includes(u.role as Role) ? (u.role as Role) : 'viewer';
                        const rowBtn = canManage ? () => setEditing(u) : undefined;
                        return (
                           <div
                              key={u.id}
                              className={`flex flex-col gap-2 p-4 ${canManage ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                              onClick={rowBtn}
                           >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                 <div className="flex min-w-0 items-center gap-2">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                       <UserRound className="size-4 text-muted-foreground" />
                                    </span>
                                    <div className="min-w-0">
                                       <div className="flex items-center gap-2">
                                          <button
                                             type="button"
                                             disabled={!canManage}
                                             onClick={(e) => {
                                                e.stopPropagation();
                                                setEditing(u);
                                             }}
                                             className="truncate text-sm font-medium hover:underline disabled:cursor-default disabled:no-underline"
                                          >
                                             {u.username}
                                          </button>
                                          {me?.id === u.id && (
                                             <span className="text-[10px] text-muted-foreground">
                                                you
                                             </span>
                                          )}
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
                                 <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium">
                                       {ROLE_LABEL[role]}
                                    </span>
                                    <span
                                       className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                                          u.ops_access
                                             ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                             : 'bg-muted text-muted-foreground'
                                       }`}
                                    >
                                       {u.ops_access ? 'console' : 'no console'}
                                    </span>
                                    {canManage && (
                                       <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs"
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             setEditing(u);
                                          }}
                                       >
                                          <Pencil className="size-3.5" /> Manage
                                       </Button>
                                    )}
                                 </div>
                              </div>
                              {/* workspace membership (read-only summary) */}
                              <div className="flex flex-wrap gap-1.5 pl-10">
                                 {role === 'owner' || role === 'admin' ? (
                                    <span className="text-[11px] text-muted-foreground">
                                       All workspaces
                                    </span>
                                 ) : mine.size === 0 ? (
                                    <span className="text-[11px] text-muted-foreground">
                                       No workspaces
                                    </span>
                                 ) : (
                                    WORKSPACES.filter((w) => mine.has(w.slug)).map((w) => (
                                       <span
                                          key={w.slug}
                                          className="rounded-full border border-primary/40 bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                                       >
                                          {w.name}
                                       </span>
                                    ))
                                 )}
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
                                    They&apos;ll be asked to change it on first sign-in.
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
                        New users get console access and no workspaces — click their name above to
                        add workspaces once created.
                     </p>
                  </div>
               </SettingsCard>
            </SettingsSection>
         )}

         {editing && me && (
            <UserAccessDialog
               user={editing}
               memberships={memberships}
               me={me}
               onClose={() => setEditing(null)}
               onSaved={load}
               onPassword={(t) => setCreated({ email: t.email, password: t.password })}
            />
         )}
      </SettingsShell>
   );
}
