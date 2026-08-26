"use client";

import { useEffect } from "react";
import { useIssuesStore } from "@/store/issues-store";
import { hydrateIssue, memberToUser, type RawIssue, type RawMember } from "@/lib/ops-hydrate";

// Loads real members + issues from the ops backend into the store on mount, so
// the whole Circle UI renders live data instead of the mock seed.
export function OpsBootstrap() {
  const setIssues = useIssuesStore((s) => s.setIssues);
  const setMembers = useIssuesStore((s) => s.setMembers);

  useEffect(() => {
    let live = true;
    (async () => {
      const [mRes, iRes] = await Promise.all([
        fetch("/api/ops/members", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/ops/issues", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!live) return;
      const users = ((mRes?.members ?? []) as RawMember[]).map(memberToUser);
      setMembers(users);
      const issues = ((iRes?.issues ?? []) as RawIssue[]).map((row) => hydrateIssue(row, users));
      setIssues(issues);
    })();
    return () => {
      live = false;
    };
  }, [setIssues, setMembers]);

  return null;
}
