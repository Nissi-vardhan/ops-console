'use client';

import { useEffect } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import {
   hydrateIssue,
   hydrateProject,
   memberToUser,
   type RawIssue,
   type RawMember,
   type RawProject,
} from '@/lib/ops-hydrate';

// Loads real members + issues from the ops backend into the store on mount, so
// the whole Circle UI renders live data instead of the mock seed.
// Module-level guard: MainLayout re-mounts on every tab navigation, so without
// this the whole dataset would re-fetch on each switch. Runs once per page load.
let bootstrapped = false;

export function OpsBootstrap() {
   const setIssues = useIssuesStore((s) => s.setIssues);
   const setMembers = useIssuesStore((s) => s.setMembers);
   const setProjects = useIssuesStore((s) => s.setProjects);
   const setCurrentUser = useIssuesStore((s) => s.setCurrentUser);

   useEffect(() => {
      if (bootstrapped) return;
      bootstrapped = true;
      let live = true;
      const get = (p: string) =>
         fetch(p, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
      (async () => {
         // Fire all four in parallel, but paint the lighter data (members, projects,
         // current user) as soon as it lands — don't block the whole UI on the
         // potentially-large issues payload.
         const mP = get('/api/ops/members');
         const iP = get('/api/ops/issues');
         const pP = get('/api/ops/projects');
         const meP = get('/api/ops/me');

         const [mRes, pRes, meRes] = await Promise.all([mP, pP, meP]);
         if (!live) return;
         const users = ((mRes?.members ?? []) as RawMember[]).map(memberToUser);
         setMembers(users);
         setCurrentUser(meRes?.user?.id ?? null);
         const projects = ((pRes?.projects ?? []) as RawProject[]).map((row) =>
            hydrateProject(row, users)
         );
         setProjects(projects);

         const iRes = await iP;
         if (!live) return;
         const issues = ((iRes?.issues ?? []) as RawIssue[]).map((row) =>
            hydrateIssue(row, users, projects)
         );
         setIssues(issues);
      })();
      return () => {
         live = false;
      };
   }, [setIssues, setMembers, setProjects, setCurrentUser]);

   return null;
}
