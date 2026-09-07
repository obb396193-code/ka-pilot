import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createPool, JobRepository, SessionCleanupRepository, SessionCleanupError, SESSION_CLEANUP_JOB_TYPE } from "@ka/db";
import { assertProductionEnvironment } from "../production-environment.js";
import { JobConsumer } from "../jobs/consumer.js";
import { deterministicJobId } from "../jobs/deterministic-id.js";
import { createSessionCleanupHandler } from "./session-cleanup-handler.js";

const configSchema = z.object({
  databaseUrl: z.string().url().refine((v) => ["postgres:", "postgresql:"].includes(new URL(v).protocol)),
  workspaceId: z.string().uuid(), runId: z.string().uuid(),
  maxMs: z.coerce.number().int().positive().max(600_000).default(60_000),
}).strict();
export type SessionCleanupConfig = z.infer<typeof configSchema>;
export function parseSessionCleanupConfig(env: Readonly<NodeJS.ProcessEnv>): SessionCleanupConfig {
  try {
    assertProductionEnvironment(env);
    return configSchema.parse({ databaseUrl: env.DATABASE_URL, workspaceId: env.SESSION_CLEANUP_WORKSPACE_ID,
      runId: env.SESSION_CLEANUP_RUN_ID, maxMs: env.SESSION_CLEANUP_MAX_MS });
  } catch { throw new SessionCleanupError(); }
}

async function closePool(pool: ReturnType<typeof createPool>): Promise<void> {
  try { await pool.end(); } catch { throw new SessionCleanupError(); }
}

/** One deployment-owned tick, never a global daemon or a media-authority fallback. */
export async function executeSessionCleanupOnce(input: unknown): Promise<"completed" | "pending"> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) throw new SessionCleanupError();
  const config = parsed.data;
  const pool = createPool(config.databaseUrl, { max: 2, connectionTimeoutMillis: 5000 });
  const jobs = new JobRepository(pool, { workspaceId: config.workspaceId, jobTypes: [SESSION_CLEANUP_JOB_TYPE] });
  try {
    const workspace = await pool.query("SELECT id FROM workspaces WHERE id=$1", [config.workspaceId]);
    if (workspace.rowCount !== 1) throw new SessionCleanupError();
    const id = await jobs.enqueue({ id: deterministicJobId(`session-cleanup:${config.workspaceId}:${config.runId}`),
      workspaceId: config.workspaceId, jobType: SESSION_CLEANUP_JOB_TYPE, payload: {}, credentialOwnerUserId: null });
    const status = async () => {
      const result = await pool.query<{ status: string }>("SELECT status FROM jobs WHERE id=$1 AND workspace_id=$2 AND job_type=$3", [id, config.workspaceId, SESSION_CLEANUP_JOB_TYPE]);
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row || !["queued", "leased", "running", "done", "failed", "blocked_auth"].includes(row.status)) throw new SessionCleanupError();
      if (row.status === "failed" || row.status === "blocked_auth") throw new SessionCleanupError();
      return row.status;
    };
    if (await status() === "done") return "completed";
    await jobs.recoverStaleLeases(1);
    const consumer = new JobConsumer(jobs, { [SESSION_CLEANUP_JOB_TYPE]: createSessionCleanupHandler(new SessionCleanupRepository(pool)) }, { leaseSeconds: 30 });
    for (let attempted = 0; attempted < 10; attempted++) {
      if (!await consumer.processOnce()) break;
      if (await status() === "done") return "completed";
    }
    return await status() === "done" ? "completed" : "pending";
  } catch { throw new SessionCleanupError(); }
  finally { await closePool(pool); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.send || process.argv.length !== 2) throw new SessionCleanupError();
    // Only a round-completion marker, never driver output or session data.
    await executeSessionCleanupOnce(parseSessionCleanupConfig(process.env));
    await new Promise<void>((resolve, reject) => {
      if (!process.connected || !process.send) { reject(new SessionCleanupError()); return; }
      process.send({ kind: "terminal", status: "completed" }, (error) => error ? reject(new SessionCleanupError()) : resolve());
    });
  } catch { process.exitCode = 1; }
  finally { if (process.connected) process.disconnect(); }
}
