// Runs once when a new Next.js server instance boots (before serving requests).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("@/lib/migrate");
    try {
      await runMigrations();
    } catch (err) {
      console.error("[migrate] failed:", err);
    }
  }
}
