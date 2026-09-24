'use client';

import { useMemo, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { ROLES, ROLE_LABEL, ASSIGNABLE_ROLES, normalizeRole, type Role } from '@/lib/rbac';
import { WORKSPACES } from '@/lib/workspaces';

export interface AdminUser {
   id: string;
   email: string;
   username: string;
   role: string;
   ops_access: boolean;
   active: boolean;
}
export interface Membership {
   user_id: string;
   workspace: string;
   role: string;
}

const ROLE_DESC: Record<Role, string> = {
   owner: 'Full control of the console, every workspace, users and settings.',
   admin: 'Manage users and settings; full access to every workspace.',
   member: 'Work inside the workspaces they are added to.',
   viewer: 'Read-only inside the workspaces they are added to.',
};

type WsDraft = Record<string, { member: boolean; role: Role }>;

interface Draft {
   role: Role;
   ops_access: boolean;
   active: boolean;
   ws: WsDraft;
}

function initialDraft(user: AdminUser, memberships: Membership[]): Draft {
   const ws: WsDraft = {};
   for (const w of WORKSPACES) {
      const m = memberships.find((x) => x.user_id === user.id && x.workspace === w.slug);
      ws[w.slug] = { member: !!m, role: m ? normalizeRole(m.role) : 'member' };
   }
   return { role: normalizeRole(user.role), ops_access: user.ops_access, active: user.active, ws };
}

/**
 * Everything about one user's access in a single dialog: global role, console
 * access, active flag, per-workspace membership + role, password reset. Changes
 * are collected into a diff, confirmed, then applied (PATCH for the globals,
 * one workspace call per membership change).
 */
export default function UserAccessDialog({
   user,
   memberships,
   me,
   onClose,
   onSaved,
   onPassword,
}: {
   user: AdminUser;
   memberships: Membership[];
   me: { id: string; role: string };
   onClose: () => void;
   onSaved: () => Promise<void> | void;
   onPassword: (t: { email: string; password: string }) => void;
}) {
   const base = useMemo(() => initialDraft(user, memberships), [user, memberships]);
   const [draft, setDraft] = useState<Draft>(base);
   const [confirming, setConfirming] = useState(false);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string | null>(null);

   const isSelf = user.id === me.id;
   const targetIsOwner = base.role === 'owner';
   const meOwner = me.role === 'owner';
   const canTouchRole = !isSelf && (meOwner || !targetIsOwner);
   const roleOptions = meOwner ? ROLES : ASSIGNABLE_ROLES;
   const globalAccess = draft.role === 'owner' || draft.role === 'admin';

   const diff = useMemo(() => {
      const lines: string[] = [];
      if (draft.role !== base.role)
         lines.push(`Role: ${ROLE_LABEL[base.role]} → ${ROLE_LABEL[draft.role]}`);
      if (draft.ops_access !== base.ops_access)
         lines.push(`Console access: ${draft.ops_access ? 'granted' : 'revoked'}`);
      if (draft.active !== base.active)
         lines.push(draft.active ? 'Reactivate account' : 'Deactivate account');
      for (const w of WORKSPACES) {
         const a = base.ws[w.slug];
         const b = draft.ws[w.slug];
         if (!a.member && b.member) lines.push(`Add to ${w.name} as ${ROLE_LABEL[b.role]}`);
         else if (a.member && !b.member) lines.push(`Remove from ${w.name}`);
         else if (a.member && b.member && a.role !== b.role)
            lines.push(`${w.name}: ${ROLE_LABEL[a.role]} → ${ROLE_LABEL[b.role]}`);
      }
      return lines;
   }, [draft, base]);
   const dirty = diff.length > 0;

   const apply = async () => {
      setBusy(true);
      setError(null);
      try {
         const globals: Record<string, unknown> = {};
         if (draft.role !== base.role) globals.role = draft.role;
         if (draft.ops_access !== base.ops_access) globals.ops_access = draft.ops_access;
         if (draft.active !== base.active) globals.active = draft.active;
         if (Object.keys(globals).length) {
            const r = await fetch(`/api/ops/users/${user.id}`, {
               method: 'PATCH',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(globals),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.error || 'Update failed.');
         }
         for (const w of WORKSPACES) {
            const a = base.ws[w.slug];
            const b = draft.ws[w.slug];
            if (b.member && (!a.member || a.role !== b.role)) {
               const r = await fetch(`/api/ops/workspaces/${w.slug}/members`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: user.id, role: b.role }),
               });
               if (!r.ok) throw new Error(`Could not update ${w.name} access.`);
            } else if (a.member && !b.member) {
               const r = await fetch(
                  `/api/ops/workspaces/${w.slug}/members?user_id=${encodeURIComponent(user.id)}`,
                  { method: 'DELETE' }
               );
               if (!r.ok) throw new Error(`Could not remove from ${w.name}.`);
            }
         }
         await onSaved();
         onClose();
      } catch (e) {
         setError((e as Error).message);
      } finally {
         setBusy(false);
         setConfirming(false);
      }
   };

   const resetPassword = async () => {
      if (
         !window.confirm(
            `Reset ${user.email}'s password? They'll get a one-time password and must change it on next sign-in.`
         )
      )
         return;
      setBusy(true);
      setError(null);
      try {
         const r = await fetch(`/api/ops/users/${user.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset_password' }),
         });
         const d = await r.json().catch(() => ({}));
         if (!r.ok) throw new Error(d?.error || 'Reset failed.');
         onPassword({ email: user.email, password: d.generated_password });
         onClose();
      } catch (e) {
         setError((e as Error).message);
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
         <DialogContent className="sm:max-w-xl">
            <DialogHeader className="min-w-0 pr-8 sm:pr-0">
               <DialogTitle className="break-words leading-tight">
                  Access for {user.username || user.email}
               </DialogTitle>
               <DialogDescription className="break-all">
                  {user.email}
                  {isSelf ? ' · this is you' : ''}
               </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
               {/* Global role */}
               <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                     Global role
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                     {roleOptions.map((r) => {
                        const on = draft.role === r;
                        return (
                           <button
                              key={r}
                              type="button"
                              disabled={!canTouchRole}
                              onClick={() => setDraft({ ...draft, role: r })}
                              className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                 on
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:bg-muted'
                              }`}
                           >
                              <div className="text-sm font-medium">{ROLE_LABEL[r]}</div>
                              <p className="mt-0.5 text-xs text-muted-foreground">{ROLE_DESC[r]}</p>
                           </button>
                        );
                     })}
                  </div>
                  {isSelf && (
                     <p className="mt-1.5 text-xs text-muted-foreground">
                        You can&apos;t change your own role.
                     </p>
                  )}
               </section>

               {/* Console access + active */}
               <section className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                     Account
                  </p>
                  <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                     <span>
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                           <ShieldCheck className="size-4 text-emerald-600" /> Console access
                        </span>
                        <span className="block text-xs text-muted-foreground">
                           Can sign in to the ops console (password or Google).
                        </span>
                     </span>
                     <Switch
                        checked={draft.ops_access}
                        onCheckedChange={(v) => setDraft({ ...draft, ops_access: v })}
                     />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                     <span>
                        <span className="block text-sm font-medium">Active</span>
                        <span className="block text-xs text-muted-foreground">
                           Deactivated accounts can&apos;t sign in (reversible).
                        </span>
                     </span>
                     <Switch
                        checked={draft.active}
                        disabled={isSelf}
                        onCheckedChange={(v) => setDraft({ ...draft, active: v })}
                     />
                  </label>
               </section>

               {/* Workspaces */}
               <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                     Workspaces
                  </p>
                  {globalAccess && (
                     <p className="mb-2 text-xs text-muted-foreground">
                        {ROLE_LABEL[draft.role]}s see every workspace; membership below only matters
                        if the role is later lowered.
                     </p>
                  )}
                  <div className="divide-y rounded-lg border">
                     {WORKSPACES.map((w) => {
                        const row = draft.ws[w.slug];
                        return (
                           <div
                              key={w.slug}
                              className="flex items-center justify-between gap-3 px-3 py-1 sm:py-2"
                           >
                              <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-sm sm:min-h-0">
                                 <Checkbox
                                    checked={row.member}
                                    onCheckedChange={(v) =>
                                       setDraft({
                                          ...draft,
                                          ws: {
                                             ...draft.ws,
                                             [w.slug]: { ...row, member: v === true },
                                          },
                                       })
                                    }
                                 />
                                 {w.name}
                              </label>
                              <Select
                                 value={row.role}
                                 disabled={!row.member}
                                 onValueChange={(v) =>
                                    setDraft({
                                       ...draft,
                                       ws: { ...draft.ws, [w.slug]: { ...row, role: v as Role } },
                                    })
                                 }
                              >
                                 <SelectTrigger className="h-10 w-28 shrink-0 text-xs sm:h-8">
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
                           </div>
                        );
                     })}
                  </div>
               </section>

               {/* Password */}
               <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                     Password
                  </p>
                  <Button size="sm" variant="outline" onClick={resetPassword} disabled={busy}>
                     <KeyRound className="size-3.5" /> Reset password
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                     Issues a one-time password shown once; they change it on next sign-in.
                  </p>
               </section>

               {error && <p className="text-sm text-red-500">{error}</p>}
            </div>

            <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 items-center border-t bg-background px-6 py-3 sm:static sm:m-0 sm:justify-between sm:border-0 sm:p-0">
               <span className="text-xs text-muted-foreground">
                  {dirty
                     ? `${diff.length} change${diff.length > 1 ? 's' : ''} pending`
                     : 'No changes'}
               </span>
               <div className="flex w-full gap-2 sm:w-auto">
                  <Button
                     variant="ghost"
                     className="flex-1 sm:flex-none"
                     onClick={onClose}
                     disabled={busy}
                  >
                     Cancel
                  </Button>
                  <Button
                     className="flex-1 sm:flex-none"
                     onClick={() => setConfirming(true)}
                     disabled={!dirty || busy}
                  >
                     Save changes
                  </Button>
               </div>
            </DialogFooter>
         </DialogContent>

         <AlertDialog open={confirming} onOpenChange={(o) => !o && !busy && setConfirming(false)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Apply changes to {user.email}?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                     <ul className="list-disc space-y-1 pl-5 text-sm">
                        {diff.map((l) => (
                           <li key={l}>{l}</li>
                        ))}
                     </ul>
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void apply();
                     }}
                     disabled={busy}
                  >
                     {busy ? 'Saving…' : 'Apply'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </Dialog>
   );
}
