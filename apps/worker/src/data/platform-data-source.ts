import type {
  SemanticLineageResult,
  SemanticQueryRepository,
  SemanticQueryScope,
  SemanticTableQuery,
  SemanticTableResult,
} from "@ka/db";
import type {
  SourceAuthority,
  SourceLineage,
  SourceQueryResult,
} from "@ka/domain";
import { canonicalRowSchemaVersionByQueryId } from "@ka/domain";

import type { DataQueryExecutionScope } from "./ka-data-client.js";
import type { ResolvedDataQuery } from "./query-registry.js";
import type { PlatformWindowQuery } from "./platform-window-query.js";
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
  querySummary: SemanticQueryRepository["querySummary"];
  queryTrend: SemanticQueryRepository["queryTrend"];
  queryTable: SemanticQueryRepository["queryTable"];
  queryLineage: (input: SemanticQueryScope) => Promise<SemanticLineageResult>;
}

export type PlatformReadSnapshot = (
  read: (repository: PlatformQueryRepository) => Promise<SourceQueryResult>,
) => Promise<SourceQueryResult>;

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
            ...(resolved.params.taskId === undefined ? { requestedObjects: scope.accounts.length } : {}),
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
    ...((resolved.queryId === "account.summary" || resolved.queryId === "account.trend") ? { window: {
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
  ) {}

  async query(
    resolved: ResolvedDataQuery,
    execution: DataQueryExecutionScope,
  ): Promise<SourceQueryResult> {
    try {
      if (resolved.queryId === "account.summary") {
        if (!this.windowQuery || execution.scopeKind !== "explicit_accounts") throw new Error("Window reader unavailable");
        const result = await this.windowQuery.summary({ workspaceId: execution.workspaceId,
          accounts: execution.accounts.map(({ media, accountId }) => ({ media, accountId })),
          window: { from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom" },
          ...(resolved.params.compare === undefined ? {} : { compare: resolved.params.compare }),
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
      const invalidCanonical = error instanceof CanonicalQueryRowError ||
        (error instanceof Error && (error.name === "SemanticQueryContractError" || error.name === "ZodError"));
      if (invalidCanonical) throw new PlatformDataSourceError();
      return {
        queryId: resolved.queryId,
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
      const scope = semanticScope(resolved, execution);
      const semanticLineage = await repository.queryLineage(scope);
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
        warnings: lineage.partial ? [lineage.coverage.reason ?? "Canonical result is partial"] : [],
      };
  }
}
