import { etlBatchScopeSchema, recordEtlBatchFailureSchema, type EtlBatchScope, type RecordEtlBatchFailure } from "@ka/domain";
import type { JobRecord } from "@ka/db";
import type { QihangQuery, QihangQueryResult } from "../qihang/client.js";
import type { QihangQueryPort } from "./types.js";
import { batchFailureWarning } from "./batch-failure.js";

export interface BatchFailurePort { record(input: RecordEtlBatchFailure): Promise<{ recorded: boolean }> }
export interface PartialExecution { scope: EtlBatchScope; jobId: string; leaseToken: string; failures: BatchFailurePort }
/** Opt-in dependency only. Runtime remains fail-stop until readiness is wired. */
export function partialExecution(job: JobRecord, scope: unknown, failures?: BatchFailurePort): PartialExecution | undefined {
  if (!failures) return undefined;
  const parsed = etlBatchScopeSchema.parse(scope);
  const identity = { workspaceId: recordEtlBatchFailureSchema.shape.workspaceId.parse(job.workspaceId),
    jobId: recordEtlBatchFailureSchema.shape.jobId.parse(job.id), leaseToken: recordEtlBatchFailureSchema.shape.leaseToken.parse(job.leaseToken) };
  if (identity.workspaceId !== parsed.workspaceId) throw new Error("Invalid partial execution scope");
  return { scope: parsed, jobId: identity.jobId, leaseToken: identity.leaseToken, failures };
}
export function accountQueryBatches(query: QihangQuery, execution?: PartialExecution): QihangQuery[] {
  if (!execution || query.resource === "account" || query.resource === "ad_realtime") return [query];
  const ids = query.accountIds ?? [];
  if (!ids.length) throw new Error("Partial query requires explicit accounts");
  return Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ({ ...query, accountIds: ids.slice(i * 50, i * 50 + 50) }));
}
/** Only the upstream call is caught. Validation/persistence/recording failures always abort. */
export async function queryWithBatchFailure(port: QihangQueryPort, query: QihangQuery, runId: string, execution?: PartialExecution): Promise<QihangQueryResult | null> {
  if (!execution) return port.query(query);
  if (query.resource === "account") return port.query(query); // Discovery/FK prerequisites never partial.
  const ds = query.resource === "account_offline" ? query.beginDate : query.ds;
  const accounts = query.accountIds ?? [];
  if (query.media !== execution.scope.media || !accounts.length || accounts.some(id => !execution.scope.accountIds.includes(id)) ||
    ds < execution.scope.dateFrom || ds > execution.scope.dateTo || (query.resource === "account_offline" && query.endDate !== ds)) throw new Error("Query escaped partial execution scope");
  let result: QihangQueryResult;
  try { result = await port.query(query); }
  catch (error) {
    const warning = batchFailureWarning(execution.scope.workspaceId, query, error);
    if (!warning) throw error;
    const filters = query.resource === "ad_realtime" ? {
      ...(query.hh === undefined ? {} : { hh: Number(query.hh) }),
      ...(query.adIds?.length ? { adIds: [...query.adIds] } : {}),
    } : undefined;
    await execution.failures.record(recordEtlBatchFailureSchema.parse({ workspaceId: execution.scope.workspaceId,
      jobId: execution.jobId, leaseToken: execution.leaseToken, runId, warning,
      ...(filters === undefined ? {} : { filters }) }));
    return null; // Failed batch, not a successful empty response/observation.
  }
  for (const row of result.rows) {
    const rowDs = typeof row.ds === "string" && /^\d{8}$/.test(row.ds) ? `${row.ds.slice(0, 4)}-${row.ds.slice(4, 6)}-${row.ds.slice(6)}` : row.ds;
    if (!accounts.includes(String(row.account_id)) || (rowDs !== undefined && rowDs !== ds) ||
      (row.media !== undefined && row.media !== execution.scope.media) ||
      (query.resource === "ad_realtime" && query.adIds?.length && !query.adIds.includes(String(row.ad_id)))) throw new Error("Upstream row escaped partial batch scope");
  }
  return result;
}
