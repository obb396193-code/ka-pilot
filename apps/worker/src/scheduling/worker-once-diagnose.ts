import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createPool, WorkerOnceDiagnosticsRepository } from "@ka/db";
import { parseWorkerOnceConfig } from "./worker-once.js";
import { atWorkerOnceStage, formatWorkerOnceFailure, WorkerOnceFailure } from "./worker-once-failure.js";

const n = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const snapshotSchema = z.object({
  workspace: z.object({ exists: z.boolean(), active: z.boolean(), kind: z.enum(["personal", "team"]).nullable() }).strict(),
  actors: z.object({ activeLinked: n, missingQihangIdentity: n, missingGrants: n }).strict(),
  queue: z.object({ total: n, queuedDue: n, queuedWaiting: n, blockedIdentity: n, blockedOther: n, exhausted: n,
    leasedActive: n, leaseExpired: n, done: n, failed: n, unclassified: n }).strict(),
}).strict().refine(value => {
  const { workspace, actors, queue } = value;
  return (workspace.exists ? workspace.kind !== null : workspace.kind === null && !workspace.active) &&
    actors.missingQihangIdentity <= actors.activeLinked && actors.missingGrants <= actors.activeLinked &&
    Object.entries(queue).filter(([key]) => key !== "total").reduce((sum, [, count]) => sum + count, 0) === queue.total;
});
interface DiagnosticPort { read(workspaceId: string, media: string): Promise<unknown>; close(): Promise<void> }
function open(databaseUrl: string): DiagnosticPort {
  const pool = createPool(databaseUrl, { max: 1, connectionTimeoutMillis: 5000 });
  const repository = new WorkerOnceDiagnosticsRepository(pool);
  return { read: (workspaceId, media) => repository.read(workspaceId, media), close: () => pool.end() };
}
export async function runWorkerOnceDiagnosis(options: {
  env: Readonly<NodeJS.ProcessEnv>; args: readonly string[]; write(output: string): void;
  open?: (databaseUrl: string) => DiagnosticPort;
}): Promise<void> {
  if (options.args.length) throw new WorkerOnceFailure("INVALID_CONFIG");
  const config = await atWorkerOnceStage("INVALID_CONFIG", async () => parseWorkerOnceConfig(options.env));
  await atWorkerOnceStage("DIAGNOSTIC_FAILED", async () => {
    const port = (options.open ?? open)(config.databaseUrl);
    let snapshot: z.infer<typeof snapshotSchema>;
    try { snapshot = snapshotSchema.parse(await port.read(config.workspaceId, config.media)); }
    finally { await port.close(); }
    options.write(`${JSON.stringify({ diagnosticOnly: true, readOnly: true,
      checks: { configuration: "valid", database: "readable", credentials: "presence_only", qihangNetwork: "not_checked", upstreamData: "not_checked" },
      extraCaConfigured: !!options.env.NODE_EXTRA_CA_CERTS?.trim(), ...snapshot })}\n`);
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runWorkerOnceDiagnosis({ env: process.env, args: process.argv.slice(2), write: output => { process.stdout.write(output); } })
    .catch((error: unknown) => { process.stderr.write(formatWorkerOnceFailure(error)); process.exitCode = 1; });
}
