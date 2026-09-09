import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { WorkerOnceConfig } from "./worker-once.js";
import { superviseWorkerOnce } from "./worker-once-supervisor.js";
import { formatWorkerOnceFailure, safeWorkerOnceFailure } from "./worker-once-failure.js";

export function workerOnceChildEnvironment(config: WorkerOnceConfig, env: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return { PATH: env.PATH, NODE_ENV: env.NODE_ENV, NODE_EXTRA_CA_CERTS: env.NODE_EXTRA_CA_CERTS,
    DATABASE_URL: config.databaseUrl, QIHANG_BASE_URL: config.qihangBaseUrl,
    WORKER_ONCE_WORKSPACE_ID: config.workspaceId, WORKER_ONCE_MEDIA: config.media, WORKER_ONCE_MODE: config.mode,
    WORKER_ONCE_MAX_MS: String(config.maxMs), WORKER_LEASE_SECONDS: String(config.leaseSeconds) };
}

/** Never pass the trigger token, browser data, or a shared service identity to the child. */
export function runWorkerOnceProcess(config: WorkerOnceConfig, signal: AbortSignal) {
  return superviseWorkerOnce({ maxMs: config.maxMs, signal,
    startChild: () => fork(new URL("./worker-once-child.ts", import.meta.url), [new Date().toISOString()], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), execArgv: ["--import", "tsx"],
      env: workerOnceChildEnvironment(config, process.env),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    }),
  }).catch((error: unknown) => {
    process.stderr.write(formatWorkerOnceFailure(error));
    throw safeWorkerOnceFailure(error);
  });
}
