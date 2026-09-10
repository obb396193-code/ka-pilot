import { sourceQueryResultSchema, type ApprovedWorkspaceAuthContext, type SourceQueryResult } from "@ka/domain";
import { z } from "zod";
import type { ResolvedDataQuery } from "./query-registry.js";

export interface HourlyQueryPort {
  query(resolved: ResolvedDataQuery, auth: ApprovedWorkspaceAuthContext): Promise<unknown>;
}
export class HourlySourceError extends Error {
  constructor(readonly code: "FORBIDDEN" | "UPSTREAM_INVALID_RESPONSE" | "SOURCE_TRUNCATED" |
    "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT") { super(code); }
}
const internalProof = z.object({ workspaceId: z.string().uuid(), source: sourceQueryResultSchema }).strict();

/** Public hourly rows intentionally omit workspaceId per Contract. The internal
 * adapter proof MUST preserve it; all public pairs/hours are checked a second
 * time. No daily source fallback, current-time lineage or implicit grant.
 */
export function validateHourlySource(raw: unknown, resolved: ResolvedDataQuery, auth: ApprovedWorkspaceAuthContext): SourceQueryResult {
  const parsed = internalProof.safeParse(raw);
  if (!parsed.success) throw new HourlySourceError("UPSTREAM_INVALID_RESPONSE");
  if (auth.workspaceKind !== "personal" || parsed.data.workspaceId !== auth.workspaceId) throw new HourlySourceError("FORBIDDEN");
  const source = parsed.data.source, window = source.lineage.window;
  if (resolved.queryId !== "account.hourly" || source.queryId !== resolved.queryId || !window || window.from !== resolved.params.dateFrom ||
    window.to !== resolved.params.dateTo || source.lineage.workspaceKind !== "personal" || source.lineage.source === "ka_data")
    throw new HourlySourceError("UPSTREAM_INVALID_RESPONSE");
  if (source.lineage.truncated || source.rows.length > resolved.maxRows ||
    (source.rows.length === resolved.maxRows && (source.wholeResultTotal.availability !== "available" || source.wholeResultTotal.value !== source.rows.length)))
    throw new HourlySourceError("SOURCE_TRUNCATED");
  if (source.status === "unavailable") return source;
  // Hourly is unpaginated: an available full total must describe this exact set,
  // not a hidden page or an unrelated source-wide count.
  if (source.wholeResultTotal.availability === "available" && source.wholeResultTotal.value !== source.rows.length)
    throw new HourlySourceError("UPSTREAM_INVALID_RESPONSE");
  const allowed = new Set(auth.scope.accounts.map(a => JSON.stringify([a.media, a.accountId])));
  const coverage = source.lineage.coverage, from = resolved.params.hhFrom ?? 0, to = resolved.params.hhTo ?? 24;
  if (coverage.requestedObjects !== allowed.size || (coverage.returnedObjects !== undefined && coverage.returnedObjects > allowed.size) ||
    (coverage.complete && (coverage.returnedObjects !== allowed.size || source.rows.length !== allowed.size * (to - from + 1))))
    throw new HourlySourceError("UPSTREAM_INVALID_RESPONSE");
  for (const row of source.rows) {
    if (!allowed.has(JSON.stringify([row.media, row.accountId])) || row.media !== resolved.params.media) throw new HourlySourceError("FORBIDDEN");
    if (typeof row.hh !== "number" || row.hh < from || row.hh > to) throw new HourlySourceError("UPSTREAM_INVALID_RESPONSE");
  }
  return source;
}
