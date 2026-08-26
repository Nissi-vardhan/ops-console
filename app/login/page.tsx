"use client";

import { useState } from "react";

export default function OpsLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (r.ok) {
      window.location.href = "/";
      return;
    }
    const d = await r.json().catch(() => ({}));
    setErr(d.error || "Sign-in failed");
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0e] px-4 text-neutral-100">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#5e6ad2] text-sm font-bold">
            OPS
          </div>
          <h1 className="text-lg font-semibold">Shortcastle Ops</h1>
          <p className="mt-1 text-sm text-neutral-400">Sign in to the operations console</p>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-800 bg-[#111114] p-5">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-neutral-700 bg-[#0b0b0e] px-3 py-2 text-sm outline-none focus:border-[#5e6ad2]"
              placeholder="you@shortcastle.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-[#0b0b0e] px-3 py-2 text-sm outline-none focus:border-[#5e6ad2]"
              placeholder="••••••••"
            />
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="w-full rounded-lg bg-[#5e6ad2] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#5058c0] disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="pt-1 text-center text-[11px] text-neutral-500">
            Ops-access accounts only. Manage access in the tracker&apos;s Members tab.
          </p>
        </form>
      </div>
    </div>
  );
}
