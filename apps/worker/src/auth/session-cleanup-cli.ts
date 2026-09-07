import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseSessionCleanupConfig } from "./session-cleanup-once.js";
import { superviseWorkerOnce } from "../scheduling/worker-once-supervisor.js";

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("Invalid arguments");
  const config = parseSessionCleanupConfig(process.env), controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const result = await superviseWorkerOnce({
      maxMs: config.maxMs, signal: controller.signal,
      startChild: () => fork(new URL("./session-cleanup-once.ts", import.meta.url), [], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)), execArgv: ["--import", "tsx"], env: process.env,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      }),
    });
    if (result.status === "aborted" || result.status === "blocked_auth") throw new Error("Interrupted");
    // Round completion is NOT a claim that all eligible sessions or queued jobs are drained.
    process.stdout.write(result.status === "budget" ? "Session cleanup round budget reached\n" : "Session cleanup round finished\n");
  } finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}
await main().catch(() => { process.stderr.write("Session cleanup failed\n"); process.exitCode = 1; });
