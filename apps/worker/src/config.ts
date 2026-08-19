import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();

const workerConfigSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  QIHANG_BASE_URL: z.string().url().optional(),
  WORKER_POLL_INTERVAL_MS: positiveInteger.default(1_000),
  WORKER_LEASE_SECONDS: positiveInteger.default(60),
  WORKER_SERVICE_QIHANG_USER_ID: z.string().trim().min(1).optional(),
});

export interface WorkerConfig {
  databaseUrl: string;
  qihangBaseUrl?: string;
  pollIntervalMs: number;
  leaseSeconds: number;
  serviceQihangUserId: string | null;
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = workerConfigSchema.parse(environment);
  return {
    databaseUrl: parsed.DATABASE_URL,
    ...(parsed.QIHANG_BASE_URL === undefined
      ? {}
      : { qihangBaseUrl: parsed.QIHANG_BASE_URL }),
    pollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
    leaseSeconds: parsed.WORKER_LEASE_SECONDS,
    serviceQihangUserId: parsed.WORKER_SERVICE_QIHANG_USER_ID ?? null,
  };
}
