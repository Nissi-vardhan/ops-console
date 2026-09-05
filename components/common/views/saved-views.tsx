'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { displayOrderedStatus } from '@/mock-data/status';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { useActiveWorkspaceStore, inActiveWorkspace } from '@/store/active-workspace-store';
import { useViewStore } from '@/store/view-store';
import {
   AlertTriangle,
   CalendarClock,
   CircleUser,
   Inbox,
   PackageOpen,
   ShieldAlert,
} from 'lucide-react';
import { useMemo } from 'react';

const OPEN = (i: Issue) => i.status.category !== 'completed' && i.status.category !== 'canceled';

export interface ViewDef {
   key: string;
   name: string;
   description: string;
   icon: typeof AlertTriangle;
   predicate: (i: Issue, ctx: { currentUserId: string | null }) => boolean;
}

// The saved views shown in the sidebar. Each is just a predicate over live issues.
export const VIEWS: ViewDef[] = [
   {
      key: 'urgent',
      name: 'Urgent',
      description: 'Open issues marked Urgent priority.',
      icon: AlertTriangle,
      predicate: (i) => OPEN(i) && i.priority.id === 'urgent',
   },
   {
      key: 'unassigned',
      name: 'Unassigned',
      description: 'Open issues with no owner — pick one up.',
      icon: Inbox,
      predicate: (i) => OPEN(i) && !i.assignee,
   },
   {
      key: 'mine',
      name: 'My open',
      description: 'Open issues assigned to you.',
      icon: CircleUser,
      predicate: (i, ctx) => OPEN(i) && !!ctx.currentUserId && i.assignee?.id === ctx.currentUserId,
   },
   {
      key: 'overdue',
      name: 'Overdue',
      description: 'Open issues past their due date.',
      icon: CalendarClock,
      predicate: (i) => OPEN(i) && !!i.dueDate && new Date(i.dueDate).getTime() < Date.now(),
   },
   {
      key: 'no-project',
      name: 'No project',
      description: 'Open issues not grouped under any project.',
      icon: PackageOpen,
      predicate: (i) => OPEN(i) && !i.project,
   },
   {
      key: 'security',
      name: 'Security',
      description: 'Open issues touching secrets, tokens, or access.',
      icon: ShieldAlert,
      predicate: (i) =>
         OPEN(i) &&
         (i.labels.some((l) => /secur|token|secret|auth|access/i.test(l.name)) ||
            /secur|token|secret|rotate|credential|password/i.test(
               `${i.title} ${i.description ?? ''}`
            )),
   },
];

export function getView(key: string): ViewDef | undefined {
   return VIEWS.find((v) => v.key === key);
}

export function SavedView({ viewKey }: { viewKey: string }) {
   const issues = useIssuesStore((s) => s.issues);
   const currentUserId = useIssuesStore((s) => s.currentUserId);
   const activeWorkspace = useActiveWorkspaceStore((s) => s.active);
   const { viewType } = useViewStore();
   const view = getView(viewKey);

   const displayed = useMemo(() => {
      if (!view) return [];
      // Scope to the active workspace before applying the view predicate.
      return issues.filter(
         (i) =>
            inActiveWorkspace(i.workspace, activeWorkspace) && view.predicate(i, { currentUserId })
      );
   }, [issues, view, currentUserId, activeWorkspace]);

   if (!view) {
      return <div className="p-6 text-sm text-muted-foreground">Unknown view.</div>;
   }

   if (displayed.length === 0) {
      const Icon = view.icon;
      return (
         <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-10 text-center">
            <Icon className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nothing in “{view.name}”</p>
            <p className="max-w-xs text-xs text-muted-foreground">
               {view.description} — all clear right now.
            </p>
         </div>
      );
   }

   return (
      <div className="h-full w-full overflow-hidden">
         <GroupedIssuesView
            issues={displayed}
            totalIssues={displayed}
            statuses={displayOrderedStatus}
            isViewTypeGrid={viewType === 'grid'}
         />
      </div>
   );
}
