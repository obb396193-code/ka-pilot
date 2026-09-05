import type { Pool, PoolClient } from "pg";

export interface WorkflowExecutorScope { workspaceId: string; runId: string; executorToken: string }
export interface WorkflowEffectInput extends WorkflowExecutorScope {
  nodeId: string; attempt: number; phase: "preview" | "execute" | "reconcile"; effectKey: string;
}
export interface WorkflowEffectRecord {
  acquired: boolean; status: "pending" | "done" | "failed" | "unknown"; result: unknown;
}
export class WorkflowExecutorLeaseError extends Error {
  constructor() { super("Workflow executor lease is missing, expired or replaced"); this.name = "WorkflowExecutorLeaseError"; }
}
export async function lockWorkflowExecutor(client: PoolClient, scope: WorkflowExecutorScope): Promise<void> {
  // The runtime boundary may be called from JS; no undefined-token fallback.
  if (typeof scope.executorToken !== "string" || !/^[a-f0-9-]{36}$/i.test(scope.executorToken)) throw new WorkflowExecutorLeaseError();
  const result = await client.query(`SELECT executor_token, executor_lease_until
    FROM workflow_runs WHERE id=$1 AND workspace_id=$2 FOR UPDATE`, [scope.runId,scope.workspaceId]);
  if (result.rows[0]?.executor_token !== scope.executorToken) throw new WorkflowExecutorLeaseError();
  // Check DB wall clock AFTER acquiring the lock, not before a potentially long wait.
  const time = await client.query("SELECT $1::timestamptz > clock_timestamp() AS live",[result.rows[0].executor_lease_until]);
  if (time.rows[0]?.live !== true) throw new WorkflowExecutorLeaseError();
}
async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
  catch (error) { try { await client.query("ROLLBACK"); } catch { /* preserve original */ } throw error; }
  finally { client.release(); }
}
function leaseDuration(ms: number): number {
  if (!Number.isSafeInteger(ms) || ms < 1000 || ms > 3_600_000) throw new Error("Invalid executor lease duration");
  return ms;
}
function validateEffect(input: WorkflowEffectInput): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.nodeId) || !Number.isSafeInteger(input.attempt) || input.attempt < 1 ||
    !["preview","execute","reconcile"].includes(input.phase) || typeof input.effectKey !== "string" ||
    input.effectKey.length < 1 || input.effectKey.length > 512) throw new Error("Invalid workflow effect identity");
}

export class WorkflowExecutionRepository {
  constructor(protected readonly pool: Pool) {}
  async claimExecutor(input: {workspaceId:string;runId:string;leaseMs:number}): Promise<string | null> {
    const result = await this.pool.query(`UPDATE workflow_runs SET executor_token=gen_random_uuid(),
      executor_lease_until=clock_timestamp()+$3::double precision * interval '1 millisecond'
      WHERE id=$1 AND workspace_id=$2 AND (executor_token IS NULL OR executor_lease_until <= clock_timestamp())
      RETURNING executor_token`, [input.runId,input.workspaceId,leaseDuration(input.leaseMs)]);
    return result.rows[0]?.executor_token ?? null;
  }
  async renewExecutor(input: WorkflowExecutorScope & {leaseMs:number}): Promise<void> {
    const duration = leaseDuration(input.leaseMs);
    await transaction(this.pool, async (client) => {
      await lockWorkflowExecutor(client,input);
      await client.query(`UPDATE workflow_runs SET executor_lease_until=clock_timestamp()+$2::double precision * interval '1 millisecond'
        WHERE id=$1`,[input.runId,duration]);
    });
  }
  async releaseExecutor(input: WorkflowExecutorScope): Promise<boolean> {
    const result = await this.pool.query(`UPDATE workflow_runs SET executor_token=NULL,executor_lease_until=NULL
      WHERE id=$1 AND workspace_id=$2 AND executor_token=$3 AND executor_lease_until>clock_timestamp()`,
    [input.runId,input.workspaceId,input.executorToken]);
    return result.rowCount === 1;
  }
  async reserveEffect(input: WorkflowEffectInput): Promise<WorkflowEffectRecord> {
    validateEffect(input);
    return transaction(this.pool, async (client) => {
      await lockWorkflowExecutor(client,input);
      const inserted = await client.query(`INSERT INTO workflow_effects(run_id,node_id,attempt,phase,effect_key,status)
        VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT(run_id,node_id,attempt,phase) DO NOTHING RETURNING id`,
      [input.runId,input.nodeId,input.attempt,input.phase,input.effectKey]);
      const row = (await client.query(`SELECT effect_key,status,result FROM workflow_effects
        WHERE run_id=$1 AND node_id=$2 AND attempt=$3 AND phase=$4`,[input.runId,input.nodeId,input.attempt,input.phase])).rows[0];
      if (!row || row.effect_key !== input.effectKey) throw new Error("Workflow effect identity conflict");
      if (!["pending","done","failed","unknown"].includes(row.status)) throw new Error("Invalid workflow effect state");
      return {acquired:inserted.rowCount===1,status:row.status,result:row.result};
    });
  }
  async finishEffect(input: WorkflowEffectInput & {status:"done"|"failed"|"unknown";result:unknown}): Promise<void> {
    validateEffect(input);
    const result = JSON.stringify(input.result);
    if (!result || Buffer.byteLength(result)>1_000_000 || !["done","failed","unknown"].includes(input.status)) throw new Error("Invalid workflow effect result");
    await transaction(this.pool, async (client) => {
      await lockWorkflowExecutor(client,input);
      const updated = await client.query(`UPDATE workflow_effects SET status=$6,result=$7::jsonb,finished_at=clock_timestamp()
        WHERE run_id=$1 AND node_id=$2 AND attempt=$3 AND phase=$4 AND effect_key=$5 AND status='pending' RETURNING id`,
      [input.runId,input.nodeId,input.attempt,input.phase,input.effectKey,input.status,result]);
      if (updated.rowCount===1) return;
      const duplicate = await client.query(`SELECT id FROM workflow_effects WHERE run_id=$1 AND node_id=$2 AND attempt=$3
        AND phase=$4 AND effect_key=$5 AND status=$6 AND result=$7::jsonb`,
      [input.runId,input.nodeId,input.attempt,input.phase,input.effectKey,input.status,result]);
      if (duplicate.rowCount!==1) throw new Error("Workflow effect completion conflict");
    });
  }
}
