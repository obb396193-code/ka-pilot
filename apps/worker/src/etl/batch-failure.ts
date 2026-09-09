import { createHash } from "node:crypto";
import { etlBatchFailureWarningSchema, etlBatchScopeSchema, type EtlBatchFailureWarning } from "@ka/domain";
import type { QihangQuery } from "../qihang/client.js";
import { QihangError, QihangHttpError, QihangProtocolError, RetryExhaustedError } from "../qihang/errors.js";

/** Called only around QihangQueryPort.query, never around append/upsert/lease work.
 * Returning null requires the caller to rethrow; it is NOT a successful empty batch.
 */
export function batchFailureWarning(workspaceId: string, query: QihangQuery, error: unknown): EtlBatchFailureWarning | null {
  if (!(error instanceof RetryExhaustedError) || query.resource === "account") return null;
  const cause = error.cause;
  if (cause instanceof QihangError && !(cause instanceof QihangProtocolError) &&
    !(cause instanceof QihangHttpError && [502, 503, 504].includes(cause.status))) return null;
  // The client wraps transport failures in RetryExhaustedError. Bare arbitrary
  // errors never reach this branch and no text from the wrapper is persisted.
  try {
    const ds = query.resource === "account_offline" ? query.beginDate : query.ds;
    if (query.resource === "account_offline" && query.endDate !== ds) throw new Error();
    const scope = etlBatchScopeSchema.parse({ workspaceId, media: query.media,
      accountIds: query.accountIds, dateFrom: ds, dateTo: ds });
    const accountIds = [...scope.accountIds].sort();
    const facts: Record<string, unknown> = { workspaceId, media: scope.media, resource: query.resource, ds, accountIds };
    if (query.resource === "ad_realtime") {
      if (query.hh !== undefined && ((typeof query.hh === "string" && !/^\d{1,2}$/.test(query.hh)) ||
        !Number.isInteger(Number(query.hh)) || Number(query.hh) < 0 || Number(query.hh) > 24)) throw new Error();
      if (query.adIds !== undefined && (!Array.isArray(query.adIds) || query.adIds.length > 1000 ||
        query.adIds.some(id => typeof id !== "string" || !id.trim() || id !== id.trim() || /\p{Cc}/u.test(id)))) throw new Error();
      facts.hh = query.hh === undefined ? null : Number(query.hh); facts.adIds = [...new Set(query.adIds ?? [])].sort();
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    return etlBatchFailureWarningSchema.parse({ code: "BATCH_FAILED", resource: query.resource, ds, accountIds, fingerprint });
  } catch { throw new Error("Invalid ETL batch failure"); }
}
