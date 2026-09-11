import type {
  SemanticLineageResult,
  SemanticQueryRepository,
  SemanticQueryScope,
  SemanticTableQuery,
  SemanticTableResult,
} from "@ka/db";
import { AccountDimensionEvidenceError, SemanticQueryRepository as SemanticRepository, withSemanticReadSnapshot } from "@ka/db";
import type { Pool } from "pg";
import type {
  SourceAuthority,
  SourceLineage,
  SourceQueryResult,
  ApprovedWorkspaceAuthContext,
} from "@ka/domain";
import { canonicalRowSchemaVersionByQueryId, sourceQueryResultSchema, approvedWorkspaceAuthContextSchema } from "@ka/domain";
import { PlatformPivotQueryError, type PlatformPivotQuery } from "./platform-pivot-query.js";
import { DataSourceRoutingError } from "./data-source-routing.js";
import { createDashboardScopeResolver, type DashboardScopeResolver } from "./dashboard-filter-scope.js";

import type { DataQueryExecutionScope } from "./ka-data-client.js";
import type { ResolvedDataQuery } from "./query-registry.js";
import type { PlatformWindowQuery } from "./platform-window-query.js";
import type { PlatformDimensionQuery } from "./platform-dimension-query.js";
import { assertTaskWindowDates, taskWindowDates } from "./task-window-coverage.js";
import {
  CanonicalQueryRowError,
  canonicalizeQueryRows,
  maskCanonicalQueryRows,
} from "./canonical-query-rows.js";

const PLATFORM_SOURCE_REQUEST_ID = "platform-source";

export class PlatformDataSourceError extends Error {
  readonly code = "UPSTREAM_INVALID_RESPONSE" as const;
  readonly retryable = false;

  constructor() {
    super("Platform source returned rows outside the canonical query contract");
    this.name = "PlatformDataSourceError";
  }
}

export interface PlatformQueryRepository {
  resolveDashboardScope?: DashboardScopeResolver;
  querySummary: SemanticQueryRepository["querySummary"];
  queryTrend: SemanticQueryRepository["queryTrend"];
  queryTable: SemanticQueryRepository["queryTable"];
  queryLineage: (input: SemanticQueryScope) => Promise<SemanticLineageResult>;
}

export type PlatformReadSnapshot = (
  read: (repository: PlatformQueryRepository) => Promise<SourceQueryResult>,
) => Promise<SourceQueryResult>;
export function createPlatformReadSnapshot(pool: Pick<Pool, "connect">): PlatformReadSnapshot {
  return read => withSemanticReadSnapshot(pool, connection => {
    const repository = new SemanticRepository(connection);
    return read({ querySummary: repository.querySummary.bind(repository), queryTrend: repository.queryTrend.bind(repository),
      queryTable: repository.queryTable.bind(repository), queryLineage: repository.queryLineage.bind(repository),
      resolveDashboardScope: createDashboardScopeResolver(connection) });
  });
}

function authorityFor(resolved: ResolvedDataQuery): SourceAuthority {
  const defaultSource = resolved.authorityPolicy.defaultSource;
  return {
    policyVersion: resolved.authorityPolicy.policyVersion,
    useCase: resolved.authorityPolicy.useCase,
    role: defaultSource === "source_versioned"
      ? "source_versioned"
      : defaultSource === "platform"
        ? "default_authoritative"
        : "comparison_reference",
  };
}

function semanticScope(
  resolved: ResolvedDataQuery,
  execution: DataQueryExecutionScope,
): SemanticQueryScope {
  return {
    workspaceId: execution.workspaceId,
    dateFrom: resolved.params.dateFrom,
    dateTo: resolved.params.dateTo,
    filters: {
      ...(execution.scopeKind === "explicit_accounts"
        ? {
            accountScopes: execution.accounts.map((account) => ({
              media: account.media,
              accountId: account.accountId,
            })),
          }
        : {}),
      ...(resolved.params.media === undefined ? {} : { media: resolved.params.media }),
      ...(resolved.params.taskId === undefined ? {} : { taskId: resolved.params.taskId }),
      ...(resolved.params.accountId === undefined
        ? {}
        : { accountId: resolved.params.accountId }),
    },
  };
}

function metadataAvailability(lineage: {
  datasetVersion: string | null;
  dataAsOf: string | null;
  timezone: string | null;
  dayCut: string | null;
}): SourceLineage["metadataAvailability"] {
  const known = Object.values(lineage).filter((value) => value !== null).length;
  if (known === 0) return "unknown";
  if (known === 4) return "known";
  return "partial";
}

function sourceLineage(
  resolved: ResolvedDataQuery,
  scope: DataQueryExecutionScope,
  lineage: SemanticLineageResult,
  truncated: boolean,
): SourceLineage {
  if (
    scope.scopeKind === "explicit_accounts" &&
    lineage.returnedAccounts > scope.accounts.length
  ) {
    throw new CanonicalQueryRowError();
  }
  const coverageComplete = scope.scopeKind === "team_workspace_readonly"
    ? !truncated
    : lineage.requestedAccountDays === 0 ||
      lineage.returnedAccountDays >= lineage.requestedAccountDays;
  const partial = truncated || !coverageComplete;
  const sourceMetadata = {
    datasetVersion: null,
    dataAsOf: lineage.dataAsOf,
    timezone: null,
    dayCut: null,
  };
  return {
    source: "canonical",
    workspaceKind: scope.scopeKind === "team_workspace_readonly" ? "team" : "personal",
    ...sourceMetadata,
    metadataAvailability: metadataAvailability(sourceMetadata),
    queryTemplateVersion: resolved.queryTemplateVersion,
    metricVersion: resolved.metricVersion,
    authority: authorityFor(resolved),
    objectIdentity: {
      objectType: "account",
      joinKeys: ["workspace_id", "media", "account_id"],
    },
    coverage: {
      complete: coverageComplete && !truncated,
      ...(!coverageComplete
        ? { reason: "Canonical account-day coverage is incomplete" }
        : truncated
          ? { reason: "Canonical result exceeded the query row budget" }
          : {}),
      ...(scope.scopeKind === "explicit_accounts"
        ? {
            ...(resolved.params.taskId === undefined && resolved.params.filters === undefined ? { requestedObjects: scope.accounts.length } : {}),
            returnedObjects: Math.min(scope.accounts.length, lineage.returnedAccounts),
          }
        : { returnedObjects: lineage.returnedAccounts }),
    },
    truncated,
    partial,
  };
}

function unavailableLineage(resolved: ResolvedDataQuery, execution: DataQueryExecutionScope): SourceLineage {
  return {
    ...((resolved.queryId === "account.summary" || resolved.queryId === "account.trend" || resolved.queryId === "account.dimension") ? { window: {
      from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom",
    } } : {}),
    source: "canonical",
    workspaceKind: execution.scopeKind === "team_workspace_readonly" ? "team" : "personal",
    datasetVersion: null,
    queryTemplateVersion: resolved.queryTemplateVersion,
    metricVersion: resolved.metricVersion,
    dataAsOf: null,
    timezone: null,
    dayCut: null,
    metadataAvailability: "unknown",
    authority: authorityFor(resolved),
    objectIdentity: {
      objectType: "account",
      joinKeys: ["workspace_id", "media", "account_id"],
    },
    coverage: { complete: false, reason: "Platform source unavailable" },
    truncated: false,
    partial: true,
  };
}

async function queryAllRows(
  repository: PlatformQueryRepository,
  input: SemanticTableQuery,
  maxRows: number,
): Promise<{ result: SemanticTableResult; truncated: boolean }> {
  const pageSize = Math.min(500, maxRows);
  const rows: SemanticTableResult["rows"] = [];
  let total = 0;
  for (let page = 1; rows.length < maxRows; page += 1) {
    const result = await repository.queryTable({ ...input, page, pageSize });
    total = result.total;
    rows.push(...result.rows.slice(0, maxRows - rows.length));
    if (result.rows.length < pageSize || rows.length >= total) break;
  }
  return {
    result: { rows, total, page: 1, pageSize },
    truncated: total > rows.length,
  };
}

export class PlatformDataSource {
  constructor(
    private readonly repository: PlatformQueryRepository,
    private readonly snapshot?: PlatformReadSnapshot,
    private readonly windowQuery?: Pick<PlatformWindowQuery, "summary">,
    private readonly dimensionQuery?: Pick<PlatformDimensionQuery, "account" | "group"> & Partial<Pick<PlatformDimensionQuery, "named">>,
    private readonly pivotQuery?: Pick<PlatformPivotQuery, "query">,
  ) {}

  async pivot(resolved: ResolvedDataQuery, authInput: ApprovedWorkspaceAuthContext) {
    const auth = approvedWorkspaceAuthContextSchema.parse(authInput);
    if (resolved.queryId !== "account.pivot2" || auth.workspaceKind !== "personal") throw new PlatformDataSourceError();
    if (!this.pivotQuery) throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Pivot reader is not configured");
    try {
      const result = await this.pivotQuery.query({ auth, dimA: resolved.params.dimA, dimB: resolved.params.dimB,
        ...(resolved.params.taskIds === undefined ? {} : { taskIds: resolved.params.taskIds }),
        window: { from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom" } });
      const observation = result.observation;
      const complete = observation.expectedAccountDays === observation.observedAccountDays && observation.missingComputedAt === 0;
      const dataAsOf = observation.missingComputedAt === 0 ? observation.earliestComputedAt : null;
      const source = sourceQueryResultSchema.parse({ queryId: resolved.queryId, rowSchemaVersion: resolved.rowSchemaVersion,
        dimA: result.dimA, dimB: result.dimB, rows: result.rows, status: "ready", returnedRowCount: result.rows.length,
        wholeResultTotal: complete ? { value: result.rows.length, availability: "available" }
          : { value: null, availability: "partial", reason: "Canonical account-day coverage or time is incomplete" },
        lineage: { source: "canonical", workspaceKind: "personal", window: result.window,
          datasetVersion: null, dataAsOf, timezone: null, dayCut: null, metadataAvailability: dataAsOf === null ? "unknown" : "partial",
          queryTemplateVersion: resolved.queryTemplateVersion, metricVersion: resolved.metricVersion, authority: authorityFor(resolved),
          objectIdentity: { objectType: "account", joinKeys: ["workspace_id", "media", "account_id"] },
          coverage: { complete, requestedObjects: auth.scope.accounts.length, returnedObjects: observation.observedAccounts,
            ...(!complete ? { reason: "Canonical account-day coverage or time is incomplete" } : {}) },
          partial: !complete, truncated: false,
        }, warnings: result.warnings,
      });
      return { source, cellCoverage: result.cellCoverage };
    } catch (error) {
      if (error instanceof PlatformPivotQueryError && error.code !== "UPSTREAM_INVALID_RESPONSE") {
        throw new DataSourceRoutingError(error.code, error.message);
      }
      if (error instanceof PlatformPivotQueryError || error instanceof CanonicalQueryRowError ||
        (error instanceof Error && error.name === "ZodError")) throw new PlatformDataSourceError();
      throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Pivot source is unavailable");
    }
  }

  async query(
    resolved: ResolvedDataQuery,
    execution: DataQueryExecutionScope,
  ): Promise<SourceQueryResult> {
    try {
      if (resolved.queryId === "account.dimension") {
        const dimension = resolved.params.dimensionType;
        if (!this.dimensionQuery || execution.scopeKind !== "explicit_accounts" || !dimension || !["account", "task", "biz", "optimizer", "goal", "placement"].includes(dimension)) throw new Error("Dimension reader unavailable");
        const input = { workspaceId: execution.workspaceId,
          ...(resolved.params.filters === undefined ? {} : { filters: resolved.params.filters }),
          accounts: execution.accounts.map(({ media, accountId }) => ({ media, accountId })),
          window: { from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom" } };
        const named = ["optimizer", "goal", "placement"].includes(dimension);
        if (named && !this.dimensionQuery.named) throw new Error("Named dimension reader unavailable");
        const result = dimension === "account" ? await this.dimensionQuery.account(input)
          : named ? await this.dimensionQuery.named!({ ...input, dimensionType: dimension })
          : await this.dimensionQuery.group({ ...input, dimensionType: dimension });
        const rows = canonicalizeQueryRows(resolved.queryId, "platform", result.rows, execution.workspaceId);
        const lineage = { ...sourceLineage(resolved, execution, result.lineage, false), window: result.window, warnings: result.warnings };
        return { queryId: resolved.queryId, rowSchemaVersion: resolved.rowSchemaVersion, dimension, status: "ready",
          rows, returnedRowCount: rows.length, lineage, warnings: result.warnings,
          wholeResultTotal: lineage.partial ? { value: null, availability: "partial", reason: "Canonical account-day coverage is incomplete" }
            : { value: rows.length, availability: "available" } };
      }
      if (resolved.queryId === "account.summary") {
        if (!this.windowQuery || execution.scopeKind !== "explicit_accounts") throw new Error("Window reader unavailable");
        const result = await this.windowQuery.summary({ workspaceId: execution.workspaceId,
          ...(resolved.params.filters === undefined ? {} : { filters: resolved.params.filters }),
          accounts: execution.accounts.map(({ media, accountId }) => ({ media, accountId })),
          window: { from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom" },
          ...(resolved.params.compare === undefined ? {} : { compare: resolved.params.compare }),
          ...(resolved.params.taskId === undefined ? {} : { taskId: resolved.params.taskId }),
        });
        const rows = canonicalizeQueryRows(resolved.queryId, "platform", [result.row], execution.workspaceId);
        const lineage = { ...sourceLineage(resolved, execution, result.lineage, false), window: result.window, warnings: result.warnings };
        return { queryId: resolved.queryId, rowSchemaVersion: canonicalRowSchemaVersionByQueryId[resolved.queryId],
          status: "ready", rows, returnedRowCount: rows.length, lineage, warnings: result.warnings,
          wholeResultTotal: lineage.partial ? { value: null, availability: "partial", reason: "Canonical window coverage is incomplete" }
            : { value: rows.length, availability: "available" },
        };
      }
      return await (this.snapshot
        ? this.snapshot((repository) => this.read(repository, resolved, execution))
        : this.read(this.repository, resolved, execution));
    } catch (error) {
      if (error instanceof AccountDimensionEvidenceError) {
        if (error.code === "SOURCE_TRUNCATED") throw new DataSourceRoutingError("SOURCE_TRUNCATED", "Naming evidence exceeds the bounded source limit");
        throw new PlatformDataSourceError();
      }
      const invalidCanonical = error instanceof CanonicalQueryRowError ||
        (error instanceof Error && (error.name === "SemanticQueryContractError" || error.name === "ZodError"));
      if (invalidCanonical) throw new PlatformDataSourceError();
      return {
        queryId: resolved.queryId,
        ...(resolved.queryId === "account.dimension" ? { dimension: resolved.params.dimensionType } : {}),
        rowSchemaVersion: canonicalRowSchemaVersionByQueryId[resolved.queryId],
        status: "unavailable",
        rows: [],
        returnedRowCount: 0,
        wholeResultTotal: { value: null, availability: "error", reason: "SOURCE_UNAVAILABLE" },
        lineage: unavailableLineage(resolved, execution),
        warnings: ["Platform source is unavailable"],
        error: {
          code: "SOURCE_UNAVAILABLE", message: "Platform source is unavailable",
          retryable: true, requestId: PLATFORM_SOURCE_REQUEST_ID,
        },
      };
    }
  }

  private async read(
    repository: PlatformQueryRepository,
    resolved: ResolvedDataQuery,
    execution: DataQueryExecutionScope,
  ): Promise<SourceQueryResult> {
      const baseScope = semanticScope(resolved, execution);
      if (resolved.params.filters !== undefined && !repository.resolveDashboardScope) throw new CanonicalQueryRowError();
      const selection = resolved.params.filters === undefined ? { scope: baseScope, warnings: [] }
        : await repository.resolveDashboardScope!(baseScope, resolved.params.filters);
      const scope = selection.scope;
      const semanticLineage = await repository.queryLineage(scope);
      if (scope.filters?.accountDays !== undefined) taskWindowDates(scope, semanticLineage);
      let rows: Record<string, unknown>[];
      let total: number;
      let truncated = false;
      let aggregateAccountCount: number | undefined;

      if (resolved.queryId === "account.summary") {
        const summary = await repository.querySummary(scope);
        aggregateAccountCount = summary.accountCount;
        rows = [{ ...summary }];
        total = summary.rowCount;
      } else if (resolved.queryId === "account.trend") {
        const trend = await repository.queryTrend(scope);
        if (resolved.params.taskId !== undefined || scope.filters?.accountDays !== undefined) {
          if (!Array.isArray(trend) || trend.some((row) => typeof row !== "object" || row === null ||
            typeof row.metrics !== "object" || row.metrics === null)) throw new CanonicalQueryRowError();
          assertTaskWindowDates(scope, semanticLineage, trend.map((row) => row.ds));
          if (new Set(trend.map((row) => row.ds)).size !== trend.length ||
            trend.some((row) => !Number.isSafeInteger(row.metrics?.rowCount) || row.metrics.rowCount < 0 ||
              !Number.isSafeInteger(row.metrics?.accountCount) || row.metrics.accountCount < 0 ||
              row.metrics.accountCount !== row.metrics.rowCount || row.metrics.accountCount > execution.accounts.length) ||
            trend.reduce((sum, row) => sum + row.metrics.rowCount, 0) !== semanticLineage.canonicalRows) {
            throw new CanonicalQueryRowError();
          }
        }
        rows = trend.map((row) => ({ ...row }));
        total = rows.length;
      } else {
        const tableInput: SemanticTableQuery = {
          ...scope,
          filters: {
            ...scope.filters,
            ...(resolved.queryId === "account.anomalies" ? { dataAnomaly: true } : {}),
          },
          sortBy: "ds",
          sortDirection: "desc",
        };
        if (resolved.queryId === "account.table") {
          const result = await repository.queryTable({
            ...tableInput,
            ...(resolved.params.page === undefined ? {} : { page: resolved.params.page }),
            ...(resolved.params.pageSize === undefined
              ? {}
              : { pageSize: resolved.params.pageSize }),
          });
          rows = result.rows.map((row) => ({ ...row }));
          total = result.total;
        } else {
          const result = await queryAllRows(repository, tableInput, resolved.maxRows);
          rows = result.result.rows.map((row) => ({ ...row }));
          total = result.result.total;
          truncated = result.truncated;
        }
      }

      rows = canonicalizeQueryRows(resolved.queryId, "platform", rows, execution.workspaceId);
      if (resolved.queryId === "account.table" && scope.filters?.accountDays !== undefined) {
        const selected = new Set(scope.filters.accountDays.map(row => JSON.stringify([row.media, row.accountId, row.ds]))), seen = new Set<string>();
        if (!Number.isSafeInteger(total) || total < rows.length || total > selected.size) throw new CanonicalQueryRowError();
        for (const row of rows) {
          const key = JSON.stringify([row.media, row.accountId, row.ds]);
          if (!selected.has(key) || seen.has(key)) throw new CanonicalQueryRowError();
          seen.add(key);
        }
      }
      if (
        aggregateAccountCount !== undefined &&
        aggregateAccountCount !== semanticLineage.returnedAccounts
      ) {
        throw new CanonicalQueryRowError();
      }
      const lineage = sourceLineage(
        resolved,
        execution,
        semanticLineage,
        truncated,
      );
      if (resolved.queryId === "account.trend") lineage.window = {
        from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom",
      };
      const wholeResultTotal = lineage.partial
        ? {
            value: null,
            availability: "partial" as const,
            reason: lineage.coverage.reason ?? "Canonical result is partial",
          }
        : { value: total, availability: "available" as const };
      return {
        queryId: resolved.queryId,
        rowSchemaVersion: canonicalRowSchemaVersionByQueryId[resolved.queryId],
        status: "ready",
        rows: truncated ? maskCanonicalQueryRows(resolved.queryId, rows, "error") : rows,
        returnedRowCount: rows.length,
        wholeResultTotal,
        lineage,
        warnings: [...selection.warnings, ...(lineage.partial ? [lineage.coverage.reason ?? "Canonical result is partial"] : [])],
      };
  }
}
