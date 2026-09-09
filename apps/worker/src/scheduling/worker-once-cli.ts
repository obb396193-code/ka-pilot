import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseWorkerOnceConfig } from "./worker-once.js";
import { superviseWorkerOnce } from "./worker-once-supervisor.js";
import { atWorkerOnceStage, formatWorkerOnceFailure, WorkerOnceFailure } from "./worker-once-failure.js";

async function main(): Promise<void> {
  if (process.argv.length !== 2) throw new WorkerOnceFailure("INVALID_CONFIG");
  const config = await atWorkerOnceStage("INVALID_CONFIG", async () => parseWorkerOnceConfig(process.env));
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
    if (result.status === "aborted") throw new WorkerOnceFailure("ABORTED");
    if (result.status === "blocked_auth") throw new WorkerOnceFailure("BLOCKED_AUTH");
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}

await main().catch((error: unknown) => { process.stderr.write(formatWorkerOnceFailure(error)); process.exitCode = 1; });
