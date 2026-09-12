import { z } from "zod";
import type { Pool } from "pg";
import { AccountHourlyReadError, AccountHourlyReadRepository } from "@ka/db";
import {
  accountHourlyStoredRowSchema, approvedWorkspaceAuthContextSchema, calendarDateSchema,
  metricValue, projectAccountHourly, sourceQueryResultSchema,
  type ApprovedWorkspaceAuthContext, type SourceQueryResult,
} from "@ka/domain";
import { isResolvedDataQuery, type ResolvedDataQuery } from "./query-registry.js";
import { HourlySourceError, validateHourlySource, type HourlyQueryPort } from "./hourly-public-source.js";

const MAX_BYTES = 16 * 1024 * 1024;
const snapshotSchema = z.object({
  workspaceId: z.string().uuid(), date: calendarDateSchema,
  rows: z.array(accountHourlyStoredRowSchema.extend({ sourceRunId: accountHourlyStoredRowSchema.shape.sourceRunId.nullable() })).max(10000),
  // v1.9.39：这一整天采过样的账户（仓储按整日单独问）。老快照没有这个键 → 退回旧行为。
  sampledAccounts: z.array(z.object({ media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict()).max(1000).optional(),
  coefficient: z.object({ id: z.string().min(1), value: z.number().finite().positive(), op: z.enum(["multiply", "divide"]), effectiveDate: calendarDateSchema }).strict().nullable(),
}).strict();
interface Reader { read(auth: ApprovedWorkspaceAuthContext, request: unknown): Promise<unknown> }
const invalid = (): never => { throw new HourlySourceError("UPSTREAM_INVALID_RESPONSE"); };
const key = (row: { media: string; accountId: string }) => JSON.stringify([row.media, row.accountId]);

/** Formal adapter for the actual account-hour table. No daily/ad/Raw fallback,
 * source discovery, fabricated timezone, current-time freshness or credentials.
 */
export class PlatformHourlyQuery implements HourlyQueryPort {
  private readonly maxBytes: number;
  constructor(private readonly reader: Reader, options: { maxResponseBytes?: number } = {}) {
    this.maxBytes = options.maxResponseBytes ?? MAX_BYTES;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > MAX_BYTES) invalid();
  }
  async query(resolved: ResolvedDataQuery, rawAuth: ApprovedWorkspaceAuthContext): Promise<{ workspaceId: string; source: SourceQueryResult }> {
    const parsed = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!parsed.success || parsed.data.workspaceKind !== "personal") throw new HourlySourceError("FORBIDDEN");
    const auth = parsed.data;
    if (!isResolvedDataQuery(resolved) || resolved.queryId !== "account.hourly" || resolved.params.dateFrom !== resolved.params.dateTo) invalid();
    const date = calendarDateSchema.parse(resolved.params.dateFrom), media = resolved.params.media;
    const from = resolved.params.hhFrom ?? 0, to = resolved.params.hhTo ?? 24;
    const accounts = auth.scope.accounts.filter(a => a.media === media), allowed = new Set(accounts.map(key));
    if (allowed.size !== accounts.length || accounts.length !== auth.scope.accounts.length) throw new HourlySourceError("FORBIDDEN");
    if (accounts.length * (to - from + 1) > Math.min(10000, resolved.maxRows)) throw new HourlySourceError("SOURCE_TRUNCATED");
    let raw: unknown = { workspaceId: auth.workspaceId, date, rows: [], coefficient: null };
    if (accounts.length > 0) {
      try { raw = await this.reader.read(auth, { date, media, hhFrom: from, hhTo: to }); }
      catch (error) {
        if (error instanceof AccountHourlyReadError) {
          const code = error.code === "AMBIGUOUS_VERSION" || error.code === "INVALID_REQUEST" ? "UPSTREAM_INVALID_RESPONSE" : error.code;
          throw new HourlySourceError(code);
        }
        throw new HourlySourceError("SOURCE_UNAVAILABLE");
      }
    }
    try {
      if (Buffer.byteLength(JSON.stringify(raw)) >= MAX_BYTES) throw new HourlySourceError("SOURCE_TRUNCATED");
      const snapshot = snapshotSchema.parse(raw);
      if (snapshot.workspaceId !== auth.workspaceId) throw new HourlySourceError("FORBIDDEN");
      if (snapshot.date !== date || (snapshot.coefficient && snapshot.coefficient.effectiveDate > date)) invalid();
      for (const account of snapshot.sampledAccounts ?? []) {
        if (!allowed.has(key(account))) throw new HourlySourceError("FORBIDDEN");
      }
      for (const row of snapshot.rows) {
        if (row.workspaceId !== auth.workspaceId || !allowed.has(key(row))) throw new HourlySourceError("FORBIDDEN");
        if (row.ds !== date || row.hh < Math.max(0, from - 1) || row.hh > to) invalid();
      }
      const observations = snapshot.rows.map(row => ({ workspaceId: row.workspaceId, media: row.media, accountId: row.accountId,
        date: row.ds, hh: row.hh, cumulative: {
          cost: metricValue(row.cost), conversion: metricValue(row.conversion), realConversion: metricValue(row.realConversion),
          cashCost: metricValue(row.cost === null || snapshot.coefficient === null ? null : snapshot.coefficient.op === "multiply"
            ? row.cost * snapshot.coefficient.value : row.cost / snapshot.coefficient.value),
        }, budget: metricValue(row.budget), lastSyncAt: row.lastSyncTime, completeHour: row.complete,
        // Source day offset is not in this stored snapshot. ISO 'Z' is serialization,
        // not proof that the business day starts at UTC midnight.
        elapsedDayFraction: null,
      }));
      const rows = projectAccountHourly({ workspaceId: auth.workspaceId, date, accounts: accounts.map(a => ({ media: a.media, accountId: a.accountId })),
        hhFrom: from, hhTo: to, observations,
        ...(snapshot.sampledAccounts === undefined ? {} : { sampledAccounts: snapshot.sampledAccounts })});
      const current = snapshot.rows.filter(row => row.hh >= from && row.hh <= to);
      const dataAsOf = current.length ? new Date(Math.min(...current.map(row => Date.parse(row.lastSyncTime)))).toISOString() : null;
      const complete = rows.length > 0 && current.length === rows.length && current.every(row => row.complete) &&
        rows.every(row => Object.values(row.cumulative).every(value => value.availability === "available"));
      const warnings = ["HOURLY_DAY_TIMEZONE_UNKNOWN", ...(snapshot.coefficient === null ? ["CASH_COEFFICIENT_MISSING"] : []), ...(!complete ? ["HOURLY_COVERAGE_INCOMPLETE"] : [])];
      const source = sourceQueryResultSchema.parse({ queryId: resolved.queryId, rowSchemaVersion: resolved.rowSchemaVersion,
        status: "ready", rows, returnedRowCount: rows.length, wholeResultTotal: metricValue(complete ? rows.length : null), warnings,
        lineage: { source: "qihang_realtime", workspaceKind: "personal", window: { from: date, to: date, preset: "custom" },
          datasetVersion: null, queryTemplateVersion: resolved.queryTemplateVersion, metricVersion: resolved.metricVersion,
          dataAsOf, timezone: null, dayCut: null, metadataAvailability: dataAsOf === null ? "unknown" : "partial",
          authority: { policyVersion: resolved.authorityPolicy.policyVersion, useCase: resolved.authorityPolicy.useCase, role: "default_authoritative" },
          objectIdentity: { objectType: "account", joinKeys: ["workspace_id", "media", "account_id"] },
          coverage: { complete, requestedObjects: accounts.length, returnedObjects: new Set(current.map(key)).size,
            ...(!complete ? { reason: accounts.length === 0 ? "empty_scope" : "hourly_samples_incomplete" } : {}) },
          truncated: false, partial: !complete,
        },
      });
      const proof = { workspaceId: auth.workspaceId, source };
      if (Buffer.byteLength(JSON.stringify(proof)) >= this.maxBytes) throw new HourlySourceError("SOURCE_TRUNCATED");
      validateHourlySource(proof, resolved, auth);
      return proof;
    } catch (error) {
      if (error instanceof HourlySourceError) throw error;
      return invalid();
    }
  }
}

export function createPlatformHourlyQuery(pool: Pool): PlatformHourlyQuery {
  return new PlatformHourlyQuery(new AccountHourlyReadRepository(pool));
}
