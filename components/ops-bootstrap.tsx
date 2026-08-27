"use client";

import { useEffect } from "react";
import { useIssuesStore } from "@/store/issues-store";
import { hydrateIssue, hydrateProject, memberToUser, type RawIssue, type RawMember, type RawProject } from "@/lib/ops-hydrate";

// Loads real members + issues from the ops backend into the store on mount, so
// the whole Circle UI renders live data instead of the mock seed.
export function OpsBootstrap() {
  const setIssues = useIssuesStore((s) => s.setIssues);
  const setMembers = useIssuesStore((s) => s.setMembers);
  const setProjects = useIssuesStore((s) => s.setProjects);
  const setCurrentUser = useIssuesStore((s) => s.setCurrentUser);

  useEffect(() => {
    let live = true;
    (async () => {
      const [mRes, iRes, pRes, meRes] = await Promise.all([
        fetch("/api/ops/members", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/ops/issues", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/ops/projects", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/ops/me", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!live) return;
      const users = ((mRes?.members ?? []) as RawMember[]).map(memberToUser);
      setMembers(users);
      setCurrentUser(meRes?.user?.id ?? null);
      const projects = ((pRes?.projects ?? []) as RawProject[]).map((row) => hydrateProject(row, users));
      setProjects(projects);
      const issues = ((iRes?.issues ?? []) as RawIssue[]).map((row) => hydrateIssue(row, users, projects));
      setIssues(issues);
    })();
    return () => {
      live = false;
    };
  }, [setIssues, setMembers, setProjects, setCurrentUser]);

  return null;
}
