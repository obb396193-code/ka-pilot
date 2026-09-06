import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseWorkerOnceConfig } from "./worker-once.js";
import { superviseWorkerOnce } from "./worker-once-supervisor.js";

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new Error("Invalid arguments");
  const config = parseWorkerOnceConfig(process.env);
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const result = await superviseWorkerOnce({
      maxMs: config.maxMs, signal: controller.signal,
      startChild: () => fork(new URL("./worker-once-child.ts", import.meta.url), [new Date().toISOString()], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        execArgv: ["--import", "tsx"], env: process.env,
        // Only validated IPC is exposed. Raw driver/provider stdout/stderr stays private.
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      }),
      onJobState: (event) => { process.stdout.write(`${JSON.stringify(event)}\n`); },
    });
    if (result === "aborted") throw new Error("Interrupted");
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}

await main().catch(() => { process.stderr.write("Worker once failed\n"); process.exitCode = 1; });
