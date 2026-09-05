import { randomUUID } from "node:crypto";

import {
  approvedWorkspaceAuthContextSchema,
  dataQueryResponseSchema,
  sourceQueryResultSchema,
  type DataQueryResponse,
  type SourceAuthority,
  type SourceLineage,
  type SourceQueryResult,
  type StableDataQueryError,
  type StableDataQueryErrorCode,
  type ApprovedWorkspaceAuthContext,
} from "@ka/domain";

import {
  KaDataClientError,
  type DataQueryExecutionScope,
} from "./ka-data-client.js";
import {
  QueryRegistryError,
  type DataQueryRegistry,
  type QueryAuthorityPolicy,
  type ResolvedDataQuery,
} from "./query-registry.js";
import { resolveRequestId } from "./request-id.js";
import { PlatformDataSourceError } from "./platform-data-source.js";
import { DataSourceRoutingError, selectDataSourceRoute, type ServerDataSourcePolicy, type SelectedDataSourceRoute } from "./data-source-routing.js";

export const DATA_QUERY_HTTP_PATH = "/api/v1/data/query";
export const ADMIN_RECONCILE_HTTP_PATH = "/api/v1/admin/data/reconcile";

export interface DataSourceQueryPort {
  query(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope): Promise<SourceQueryResult>;
}

export interface DataQueryServiceDependencies {
  registry: DataQueryRegistry;
  kaData: DataSourceQueryPort;
  platform: DataSourceQueryPort;
  requestId?: () => string;
  sourcePolicy?: ServerDataSourcePolicy;
  audit?: (event: Pick<SelectedDataSourceRoute, "selectedSource" | "reason"> & { requestId: string }) => void;
}

class OutputScopeError extends Error {
  constructor() {
    super("Data source returned rows outside the authenticated scope");
    this.name = "OutputScopeError";
  }
}

class OutputContractError extends Error {
  constructor() {
    super("Data source returned an invalid canonical response");
    this.name = "OutputContractError";
  }
}

function authorityRole(
  policy: QueryAuthorityPolicy,
  source: "ka_data" | "platform",
): SourceAuthority["role"] {
  if (policy.defaultSource === "source_versioned") return "source_versioned";
  return policy.defaultSource === source ? "default_authoritative" : "comparison_reference";
}

function authorityMetadata(
  resolved: ResolvedDataQuery,
  source: "ka_data" | "platform",
): SourceAuthority {
  return {
    policyVersion: resolved.authorityPolicy.policyVersion,
    useCase: resolved.authorityPolicy.useCase,
    role: authorityRole(resolved.authorityPolicy, source),
  };
}

function withFrozenAuthority(
  result: SourceQueryResult,
  resolved: ResolvedDataQuery,
  source: "ka_data" | "platform",
  requestId: string,
): SourceQueryResult {
  return {
    ...result,
    ...(result.error === undefined
      ? {}
      : { error: { ...result.error, requestId } }),
    lineage: {
      ...result.lineage,
      authority: authorityMetadata(resolved, source),
    },
  };
}

function stableError(
  code: StableDataQueryErrorCode,
  message: string,
  retryable: boolean,
  requestId: string,
): StableDataQueryError {
  return { code, message, retryable, requestId };
}

function mapError(error: unknown, requestId: string): StableDataQueryError {
  if (error instanceof DataSourceRoutingError) {
    return stableError(error.code, error.message, error.retryable, requestId);
  }
  if (error instanceof QueryRegistryError) {
    return stableError(error.code, error.message, false, requestId);
  }
  if (error instanceof KaDataClientError) {
    return stableError(error.code, error.message, error.retryable, requestId);
  }
  if (error instanceof PlatformDataSourceError) {
    return stableError(error.code, error.message, error.retryable, requestId);
  }
  if (error instanceof OutputScopeError) {
    return stableError(
      "FORBIDDEN",
      "Data source returned rows outside the authenticated scope",
      false,
      requestId,
    );
  }
  if (error instanceof OutputContractError) {
    return stableError(
      "UPSTREAM_INVALID_RESPONSE",
      "Data source returned an invalid canonical response",
      false,
      requestId,
    );
  }
  return stableError("INTERNAL_ERROR", "The data query could not be completed", false, requestId);
}

function unavailableLineage(
  resolved: ResolvedDataQuery,
  source: "ka_data" | "platform",
): SourceLineage {
  return {
    source: source === "ka_data" ? "ka_data" : "canonical",
    datasetVersion: null,
    queryTemplateVersion: resolved.queryTemplateVersion,
    metricVersion: resolved.metricVersion,
    dataAsOf: null,
    timezone: null,
    dayCut: null,
    metadataAvailability: "unknown",
    authority: authorityMetadata(resolved, source),
    objectIdentity: {
      objectType: "account",
      joinKeys: ["workspace_id", "media", "account_id"],
    },
    coverage: { complete: false, reason: "Source unavailable" },
    truncated: false,
    partial: true,
  };
}

function unavailableSource(
  resolved: ResolvedDataQuery,
  source: "ka_data" | "platform",
  error: StableDataQueryError,
): SourceQueryResult {
  return {
    queryId: resolved.queryId,
    rowSchemaVersion: resolved.rowSchemaVersion,
    status: "unavailable",
    rows: [],
    returnedRowCount: 0,
    wholeResultTotal: { value: null, availability: "error", reason: error.code },
    lineage: unavailableLineage(resolved, source),
    warnings: [error.message],
    error,
  };
}

function sourceHasNoObjects(source: SourceQueryResult): boolean {
  if (source.lineage.coverage.returnedObjects === 0) return true;
  if (source.queryId === "account.summary") {
    return source.rows[0]?.accountCount === 0;
  }
  if (source.queryId === "account.trend" && source.rows.length > 0) {
    return source.rows.every((row) => {
      const metrics = row.metrics;
      return typeof metrics === "object" && metrics !== null && !Array.isArray(metrics) &&
        (metrics as Record<string, unknown>).accountCount === 0;
    });
  }
  return source.returnedRowCount === 0;
}

function rowAccountIdentity(row: Record<string, unknown>): {
  workspaceId: string | null;
  media: string | null;
  accountId: string | null;
} {
  const workspace = row.workspace_id ?? row.workspaceId;
  const media = row.media;
  const account = row.account_id ?? row.accountId;
  return {
    workspaceId: typeof workspace === "string" ? workspace : null,
    media: typeof media === "string" ? media : null,
    accountId: typeof account === "string" || typeof account === "number"
      ? String(account)
      : null,
  };
}

function guardSourceOutput(
  result: SourceQueryResult,
  resolved: ResolvedDataQuery,
  scope: DataQueryExecutionScope,
): SourceQueryResult {
  const parsed = sourceQueryResultSchema.safeParse(result);
  if (!parsed.success || parsed.data.queryId !== resolved.queryId) {
    throw new OutputContractError();
  }
  result = parsed.data;
  if (result.status === "unavailable") {
    if (result.error?.code === "UPSTREAM_INVALID_RESPONSE") throw new OutputContractError();
    return result;
  }
  const allowed = new Set(
    scope.accounts.map((account) => `${account.media}\u0000${account.accountId}`),
  );
  for (const row of result.rows) {
    const identity = rowAccountIdentity(row);
    const carriesIdentity = identity.media !== null || identity.accountId !== null;
    if (resolved.outputShape === "account_rows" && (
      identity.workspaceId === null ||
      identity.media === null ||
      identity.accountId === null
    )) {
      throw new OutputScopeError();
    }
    if (identity.workspaceId !== null && identity.workspaceId !== scope.workspaceId) {
      throw new OutputScopeError();
    }
    if (carriesIdentity) {
      if (
        identity.workspaceId === null ||
        identity.media === null ||
        identity.accountId === null
      ) {
        throw new OutputScopeError();
      }
      if (
        scope.scopeKind === "explicit_accounts" &&
        !allowed.has(`${identity.media}\u0000${identity.accountId}`)
      ) {
        throw new OutputScopeError();
      }
    }
  }
  if (result.rows.length <= resolved.maxRows) return result;
  const rows = result.rows.slice(0, resolved.maxRows);
  return {
    ...result,
    rows,
    returnedRowCount: rows.length,
    wholeResultTotal: {
      value: null,
      availability: "partial",
      reason: "Result exceeded the registry row budget",
    },
    lineage: {
      ...result.lineage,
      coverage: { ...result.lineage.coverage, complete: false, reason: "Registry row budget exceeded" },
      truncated: true,
      partial: true,
    },
    warnings: [...result.warnings, "Result exceeded the registry row budget"],
  };
}

function requestedAccounts(resolved: ResolvedDataQuery): readonly string[] | undefined {
  if (resolved.params.accountId !== undefined) return [resolved.params.accountId];
  return resolved.params.accountIds;
}

function executionScope(
  resolved: ResolvedDataQuery,
  auth: ApprovedWorkspaceAuthContext,
): DataQueryExecutionScope {
  const requested = requestedAccounts(resolved);
  if (auth.workspaceKind === "team") {
    return {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      scopeKind: "team_workspace_readonly",
      accounts: [],
    };
  }
  const mediaFiltered = resolved.params.media === undefined
    ? auth.scope.accounts
    : auth.scope.accounts.filter((account) => account.media === resolved.params.media);
  const requestedSet = requested === undefined ? undefined : new Set(requested);
  const accounts = requestedSet === undefined
    ? mediaFiltered
    : mediaFiltered.filter((account) => requestedSet.has(account.accountId));
  if (
    requestedSet !== undefined &&
    [...requestedSet].some((accountId) => !accounts.some((account) => account.accountId === accountId))
  ) {
    throw new QueryRegistryError("INVALID_REQUEST", "Requested account is outside the authenticated scope");
  }
  const uniqueAccounts = new Map(
    accounts.map((account) => [`${account.media}\u0000${account.accountId}`, account]),
  );
  return {
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    scopeKind: "explicit_accounts",
    accounts: [...uniqueAccounts.values()],
  };
}

function validateAuth(auth: unknown): asserts auth is ApprovedWorkspaceAuthContext {
  if (!approvedWorkspaceAuthContextSchema.safeParse(auth).success) {
    throw new QueryRegistryError("INVALID_REQUEST", "Approved authentication context is invalid");
  }
}

export class DataQueryService {
  private readonly requestId: () => string;

  constructor(private readonly dependencies: DataQueryServiceDependencies) {
    this.requestId = dependencies.requestId ?? randomUUID;
  }

  async execute(
    requestInput: unknown,
    auth: unknown,
    correlationId?: string,
  ): Promise<DataQueryResponse> {
    return this.executeRoute("ordinary", requestInput, auth, correlationId);
  }

  async executeReconcile(requestInput: unknown, auth: unknown, correlationId?: string): Promise<DataQueryResponse> {
    return this.executeRoute("admin_reconcile", requestInput, auth, correlationId);
  }

  private async executeRoute(
    endpoint: "ordinary" | "admin_reconcile",
    requestInput: unknown,
    auth: unknown,
    correlationId?: string,
  ): Promise<DataQueryResponse> {
    const requestId = resolveRequestId(correlationId ?? null, this.requestId);
    try {
      const route = selectDataSourceRoute(endpoint, requestInput, auth, this.dependencies.sourcePolicy);
      validateAuth(auth);
      this.dependencies.audit?.({ selectedSource: route.selectedSource, reason: route.reason, requestId });
      const request = route.request;
      const resolved = this.dependencies.registry.resolve(
        request.queryId,
        request.params,
        route.selectedSource,
      );
      let scope: DataQueryExecutionScope;
      try {
        scope = executionScope(resolved, auth);
      } catch (error) {
        if (error instanceof QueryRegistryError) {
          return dataQueryResponseSchema.parse({
            ok: false,
            error: stableError("FORBIDDEN", "Requested account is not authorized", false, requestId),
          });
        }
        throw error;
      }

      if (route.selectedSource === "ka_data") {
        const source = withFrozenAuthority(
          guardSourceOutput(await this.dependencies.kaData.query(resolved, scope), resolved, scope),
          resolved,
          "ka_data",
          requestId,
        );
        if (source.status === "unavailable") throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Team data source is unavailable");
        return dataQueryResponseSchema.parse({ ok: true, data: { mode: "ka_data", source } });
      }
      if (route.selectedSource === "platform") {
        const source = withFrozenAuthority(
          guardSourceOutput(await this.dependencies.platform.query(resolved, scope), resolved, scope),
          resolved,
          "platform",
          requestId,
        );
        return dataQueryResponseSchema.parse({ ok: true, data: { mode: "platform", source } });
      }

      const [kaResult, platformResult] = await Promise.allSettled([
        this.dependencies.kaData.query(resolved, scope),
        this.dependencies.platform.query(resolved, scope),
      ]);
      for (const result of [kaResult, platformResult]) {
        if (
          result.status === "rejected" &&
          (result.reason instanceof KaDataClientError ||
            result.reason instanceof PlatformDataSourceError) &&
          result.reason.code === "UPSTREAM_INVALID_RESPONSE"
        ) {
          throw result.reason;
        }
      }
      const kaData = kaResult.status === "fulfilled"
        ? withFrozenAuthority(
            guardSourceOutput(kaResult.value, resolved, scope),
            resolved,
            "ka_data",
            requestId,
          )
        : unavailableSource(resolved, "ka_data", mapError(kaResult.reason, requestId));
      const platform = platformResult.status === "fulfilled"
        ? withFrozenAuthority(
            guardSourceOutput(platformResult.value, resolved, scope),
            resolved,
            "platform",
            requestId,
          )
        : unavailableSource(resolved, "platform", mapError(platformResult.reason, requestId));
      const comparisonReason = kaData.status === "unavailable" || platform.status === "unavailable"
        ? "source_unavailable"
        : sourceHasNoObjects(kaData) !== sourceHasNoObjects(platform)
            ? "source_missing"
          : kaData.lineage.partial || platform.lineage.partial
            ? "partial_source"
          : "reconciliation_engine_pending";
      return dataQueryResponseSchema.parse({
        ok: true,
        data: {
          mode: "reconcile",
          kaData,
          platform,
          comparison: {
            status: "unavailable",
            reason: comparisonReason,
            rows: [],
          },
        },
      });
    } catch (error) {
      return dataQueryResponseSchema.parse({ ok: false, error: mapError(error, requestId) });
    }
  }
}

export interface DataQueryHttpRequest {
  method: string;
  body: unknown;
  auth: ApprovedWorkspaceAuthContext | null;
  requestId?: string;
}

export interface DataQueryHttpResponse {
  status: number;
  body: DataQueryResponse;
}

function errorStatus(code: StableDataQueryErrorCode): number {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "QUERY_NOT_ALLOWED") return 404;
  if (code === "VIEW_UNSUPPORTED") return 422;
  if (code === "SOURCE_UNAVAILABLE" || code === "UPSTREAM_TIMEOUT") return 503;
  if (code === "SOURCE_TRUNCATED" || code === "UPSTREAM_INVALID_RESPONSE") return 502;
  if (code === "INTERNAL_ERROR") return 500;
  return 400;
}

export function createDataQueryHttpHandler(service: DataQueryService, endpoint: "ordinary" | "admin_reconcile" = "ordinary") {
  return async (request: DataQueryHttpRequest): Promise<DataQueryHttpResponse> => {
    const requestId = resolveRequestId(request.requestId ?? null);
    if (request.method.toUpperCase() !== "POST") {
      return {
        status: 405,
        body: dataQueryResponseSchema.parse({
          ok: false,
          error: stableError("INVALID_REQUEST", "Only POST is supported", false, requestId),
        }),
      };
    }
    if (request.auth === null) {
      return {
        status: 401,
        body: dataQueryResponseSchema.parse({
          ok: false,
          error: stableError("UNAUTHORIZED", "Authentication is required", false, requestId),
        }),
      };
    }
    const body = endpoint === "admin_reconcile"
      ? await service.executeReconcile(request.body, request.auth, requestId)
      : await service.execute(request.body, request.auth, requestId);
    return { status: body.ok ? 200 : errorStatus(body.error.code), body };
  };
}
