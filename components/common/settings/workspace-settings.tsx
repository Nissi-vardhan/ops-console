'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';
import { WORKSPACE_STATUS, workspaceBySlug } from '@/lib/workspaces';
import { useActiveWorkspaceStore, ALL_WORKSPACES } from '@/store/active-workspace-store';
import { ASSIGNABLE_ROLES, ROLE_LABEL, type Role } from '@/lib/rbac';

interface WorkspaceMember {
   user_id: string;
   username: string;
   email: string;
   role: string;
}
interface OpsMember {
   id: string;
   email: string;
   username: string;
   role: string;
}
interface MeUser {
   id: string;
   email: string;
   username: string;
   role: string;
}

/**
 * Per-workspace settings for the ACTIVE workspace: shows its name/blurb/status
 * and manages its members. Owner / global admin / workspace-admin can add,
 * re-role, and remove members. If no workspace is active ("All workspaces"),
 * prompts the user to pick one from the switcher.
 */
export default function WorkspaceSettings() {
   const active = useActiveWorkspaceStore((s) => s.active);
   const ws = workspaceBySlug(active);

   const [me, setMe] = useState<MeUser | null>(null);
   const [members, setMembers] = useState<WorkspaceMember[]>([]);
   const [allUsers, setAllUsers] = useState<OpsMember[]>([]);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);

   const [addUser, setAddUser] = useState<string>('');
   const [addRole, setAddRole] = useState<Role>('member');
   const [busy, setBusy] = useState(false);

   useEffect(() => {
      fetch('/api/ops/me', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setMe(d?.user ?? null))
         .catch(() => {});
      fetch('/api/ops/members', { cache: 'no-store' })
         .then((r) => (r.ok ? r.json() : null))
         .then((d) => setAllUsers(Array.isArray(d?.members) ? d.members : []))
         .catch(() => {});
   }, []);

   const loadMembers = useCallback(async () => {
      if (!ws) return;
      setLoading(true);
      setError(null);
      try {
         const r = await fetch(`/api/ops/workspaces/${ws.slug}/members`, { cache: 'no-store' });
         const d = await r.json().catch(() => ({}));
         setMembers(Array.isArray(d?.members) ? d.members : []);
      } catch {
         setError('Failed to load members.');
      } finally {
         setLoading(false);
      }
   }, [ws]);

   useEffect(() => {
      void loadMembers();
   }, [loadMembers]);

   // Can the current user manage this workspace's membership?
   const myWorkspaceRole = useMemo(
      () => members.find((m) => m.user_id === me?.id)?.role ?? null,
      [members, me]
   );
   const canManage = me?.role === 'owner' || me?.role === 'admin' || myWorkspaceRole === 'admin';

   // Users not already members — the candidates for "Add member".
   const candidates = useMemo(() => {
      const have = new Set(members.map((m) => m.user_id));
      return allUsers.filter((u) => !have.has(u.id));
   }, [allUsers, members]);

   const setRole = async (userId: string, role: string) => {
      if (!ws) return;
      setBusy(true);
      setError(null);
      try {
         const r = await fetch(`/api/ops/workspaces/${ws.slug}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, role }),
         });
         if (!r.ok) throw new Error();
         await loadMembers();
      } catch {
         setError('Could not save that change.');
      } finally {
         setBusy(false);
      }
   };

   const addMember = async () => {
      if (!ws || !addUser) return;
      await setRole(addUser, addRole);
      setAddUser('');
      setAddRole('member');
   };

   const removeMember = async (userId: string) => {
      if (!ws) return;
      setBusy(true);
      setError(null);
      try {
         const r = await fetch(
            `/api/ops/workspaces/${ws.slug}/members?user_id=${encodeURIComponent(userId)}`,
            { method: 'DELETE' }
         );
         if (!r.ok) throw new Error();
         await loadMembers();
      } catch {
         setError('Could not remove that member.');
      } finally {
         setBusy(false);
      }
   };

   if (active === ALL_WORKSPACES || !ws) {
      return (
         <SettingsShell title="Workspace" description="Per-workspace members and access.">
            <SettingsCard>
               <SettingsRow
                  icon={<Boxes className="size-4" />}
                  title="Pick a workspace"
                  description="Choose a workspace from the switcher (top-left) to manage its members."
                  muted
               />
            </SettingsCard>
         </SettingsShell>
      );
   }

   return (
      <SettingsShell title={ws.name} description={ws.blurb}>
         <SettingsSection title="Workspace" description="The active workspace you're managing.">
            <SettingsCard>
               <SettingsRow
                  icon={<Boxes className="size-4" />}
                  title={ws.name}
                  description={ws.docTitle}
                  trailing={
                     <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${WORKSPACE_STATUS[ws.status]}`}
                     >
                        {ws.status}
                     </span>
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Members"
            description={
               canManage
                  ? 'Who can access this workspace, and their role here.'
                  : 'Who can access this workspace. Ask an admin to change access.'
            }
         >
            {error && <p className="text-sm text-red-500">{error}</p>}
            <SettingsCard>
               {loading && members.length === 0 ? (
                  <SettingsRow title="Loading members…" muted />
               ) : members.length === 0 ? (
                  <SettingsRow title="No members yet" muted />
               ) : (
                  members.map((m) => (
                     <SettingsRow
                        key={m.user_id}
                        title={m.username}
                        description={m.email}
                        trailing={
                           canManage ? (
                              <div className="flex items-center gap-2">
                                 <Select
                                    value={
                                       ASSIGNABLE_ROLES.includes(m.role as Role) ? m.role : 'member'
                                    }
                                    onValueChange={(v) => setRole(m.user_id, v)}
                                    disabled={busy}
                                 >
                                    <SelectTrigger className="h-8 w-28 text-xs">
                                       <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                       {ASSIGNABLE_ROLES.map((r) => (
                                          <SelectItem key={r} value={r}>
                                             {ROLE_LABEL[r]}
                                          </SelectItem>
                                       ))}
                                    </SelectContent>
                                 </Select>
                                 <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-8"
                                    aria-label={`Remove ${m.username}`}
                                    disabled={busy}
                                    onClick={() => removeMember(m.user_id)}
                                 >
                                    <Trash2 className="size-4" />
                                 </Button>
                              </div>
                           ) : (
                              <span className="text-xs">
                                 {
                                    ROLE_LABEL[
                                       (m.role as Role) in ROLE_LABEL ? (m.role as Role) : 'member'
                                    ]
                                 }
                              </span>
                           )
                        }
                     />
                  ))
               )}
            </SettingsCard>
         </SettingsSection>

         {canManage && (
            <SettingsSection
               title="Add a member"
               description="Grant a user access to this workspace with a role."
            >
               <SettingsCard>
                  <div className="flex flex-wrap items-center gap-2 p-4">
                     <Select value={addUser} onValueChange={setAddUser} disabled={busy}>
                        <SelectTrigger className="h-9 min-w-56 flex-1 text-sm">
                           <SelectValue placeholder="Select a user…" />
                        </SelectTrigger>
                        <SelectContent>
                           {candidates.length === 0 ? (
                              <SelectItem value="__none" disabled>
                                 Everyone is already a member
                              </SelectItem>
                           ) : (
                              candidates.map((u) => (
                                 <SelectItem key={u.id} value={u.id}>
                                    {u.username} · {u.email}
                                 </SelectItem>
                              ))
                           )}
                        </SelectContent>
                     </Select>
                     <Select
                        value={addRole}
                        onValueChange={(v) => setAddRole(v as Role)}
                        disabled={busy}
                     >
                        <SelectTrigger className="h-9 w-32 text-sm">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                 {ROLE_LABEL[r]}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     <Button
                        size="sm"
                        onClick={addMember}
                        disabled={busy || !addUser || addUser === '__none'}
                     >
                        <UserPlus className="size-4" />
                        Add
                     </Button>
                  </div>
               </SettingsCard>
            </SettingsSection>
         )}
      </SettingsShell>
   );
}
