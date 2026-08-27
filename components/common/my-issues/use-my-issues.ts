'use client';

import { Issue } from '@/mock-data/issues';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

export const MY_ISSUES_TABS = ['assigned', 'created', 'subscribed', 'activity'] as const;
export type MyIssuesTab = (typeof MY_ISSUES_TABS)[number];

export const MY_ISSUES_TAB_ITEMS: { label: string; value: MyIssuesTab }[] = [
   { label: 'Assigned', value: 'assigned' },
   { label: 'Activity', value: 'activity' },
];

/** Shared tab state (URL-backed) between the header and the page body. */
export function useMyIssuesTab() {
   return useQueryState('tab', parseAsStringLiteral(MY_ISSUES_TABS).withDefault('assigned'));
}

/** Issues shown by each My issues tab, scoped to the real current user. */
export function scopeMyIssues(issues: Issue[], tab: MyIssuesTab, meId: string | null): Issue[] {
   const mine = meId ? issues.filter((issue) => issue.assignee?.id === meId) : [];
   switch (tab) {
      case 'activity':
         return issues.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'assigned':
      case 'created':
      case 'subscribed':
      default:
         return mine;
   }
}
