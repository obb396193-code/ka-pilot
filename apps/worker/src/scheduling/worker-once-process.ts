import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { WorkerOnceConfig } from "./worker-once.js";
import { superviseWorkerOnce } from "./worker-once-supervisor.js";

/** Never pass the trigger token, browser data, or a shared service identity to the child. */
export function runWorkerOnceProcess(config: WorkerOnceConfig, signal: AbortSignal) {
  return superviseWorkerOnce({ maxMs: config.maxMs, signal,
    startChild: () => fork(new URL("./worker-once-child.ts", import.meta.url), [new Date().toISOString()], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), execArgv: ["--import", "tsx"],
      env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: config.databaseUrl, QIHANG_BASE_URL: config.qihangBaseUrl,
        WORKER_ONCE_WORKSPACE_ID: config.workspaceId, WORKER_ONCE_MEDIA: config.media, WORKER_ONCE_MODE: config.mode,
        WORKER_ONCE_MAX_MS: String(config.maxMs), WORKER_LEASE_SECONDS: String(config.leaseSeconds) },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    }),
  });
}
