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

import type { DataQueryExecutionScope } from "./ka-data-client.js";
import type { ResolvedDataQuery } from "./query-registry.js";

const PLATFORM_SOURCE_REQUEST_ID = "platform-source";
const CANONICAL_TIMEZONE = "Asia/Shanghai";
const CANONICAL_DAY_CUT = "calendar_day";

export interface PlatformQueryRepository {
  querySummary: SemanticQueryRepository["querySummary"];
  queryTrend: SemanticQueryRepository["queryTrend"];
  queryTable: SemanticQueryRepository["queryTable"];
  queryLineage: (input: SemanticQueryScope) => Promise<SemanticLineageResult>;
}

export interface PlatformDataSourceOptions {
  datasetVersion?: string;
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
  const accountIds = execution.accounts.map((account) => account.accountId);
  return {
    workspaceId: execution.workspaceId,
    dateFrom: resolved.params.dateFrom,
    dateTo: resolved.params.dateTo,
    filters: {
      accountIds,
      ...(resolved.params.media === undefined ? {} : { media: resolved.params.media }),
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
  datasetVersion: string | null,
  truncated: boolean,
): SourceLineage {
  const coverageComplete = lineage.requestedAccountDays === 0 ||
    lineage.returnedAccountDays >= lineage.requestedAccountDays;
  const partial = truncated || !coverageComplete;
  const sourceMetadata = {
    datasetVersion,
    dataAsOf: lineage.dataAsOf,
    timezone: CANONICAL_TIMEZONE,
    dayCut: CANONICAL_DAY_CUT,
  };
  return {
    source: "canonical",
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
      requestedObjects: scope.accounts.length,
      returnedObjects: Math.min(
        scope.accounts.length,
        lineage.returnedAccountDays,
      ),
    },
    truncated,
    partial,
  };
}

function unavailableLineage(resolved: ResolvedDataQuery): SourceLineage {
  return {
    source: "canonical",
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
  readonly #datasetVersion: string | null;

  constructor(
    private readonly repository: PlatformQueryRepository,
    options: PlatformDataSourceOptions = {},
  ) {
    this.#datasetVersion = options.datasetVersion?.trim() || null;
  }

  async query(
    resolved: ResolvedDataQuery,
    execution: DataQueryExecutionScope,
  ): Promise<SourceQueryResult> {
    const scope = semanticScope(resolved, execution);
    try {
      const lineagePromise = this.repository.queryLineage(scope);
      let rows: Record<string, unknown>[];
      let total: number;
      let truncated = false;

      if (resolved.queryId === "account.summary") {
        const summary = await this.repository.querySummary(scope);
        rows = [{ ...summary }];
        total = summary.rowCount;
      } else if (resolved.queryId === "account.trend") {
        const trend = await this.repository.queryTrend(scope);
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
          const result = await this.repository.queryTable({
            ...tableInput,
            ...(resolved.params.page === undefined ? {} : { page: resolved.params.page }),
            ...(resolved.params.pageSize === undefined
              ? {}
              : { pageSize: resolved.params.pageSize }),
          });
          rows = result.rows.map((row) => ({ ...row }));
          total = result.total;
        } else {
          const result = await queryAllRows(this.repository, tableInput, resolved.maxRows);
          rows = result.result.rows.map((row) => ({ ...row }));
          total = result.result.total;
          truncated = result.truncated;
        }
      }

      const lineage = sourceLineage(
        resolved,
        execution,
        await lineagePromise,
        this.#datasetVersion,
        truncated,
      );
      const wholeResultTotal = lineage.partial
        ? {
            value: null,
            availability: "partial" as const,
            reason: lineage.coverage.reason ?? "Canonical result is partial",
          }
        : { value: total, availability: "available" as const };
      return {
        status: "ready",
        rows,
        returnedRowCount: rows.length,
        wholeResultTotal,
        lineage,
        warnings: lineage.partial ? [lineage.coverage.reason ?? "Canonical result is partial"] : [],
      };
    } catch {
      return {
        status: "unavailable",
        rows: [],
        returnedRowCount: 0,
        wholeResultTotal: {
          value: null,
          availability: "error",
          reason: "SOURCE_UNAVAILABLE",
        },
        lineage: unavailableLineage(resolved),
        warnings: ["Platform source is unavailable"],
        error: {
          code: "SOURCE_UNAVAILABLE",
          message: "Platform source is unavailable",
          retryable: true,
          requestId: PLATFORM_SOURCE_REQUEST_ID,
        },
      };
    }
  }
}
