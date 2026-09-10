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
import { maskCanonicalQueryRows } from "./canonical-query-rows.js";
import { HourlySourceError, validateHourlySource, type HourlyQueryPort } from "./hourly-public-source.js";

export const DATA_QUERY_HTTP_PATH = "/api/v1/data/query";
export const SEMANTIC_QUERY_HTTP_PATH = "/api/v1/query";
export const ADMIN_RECONCILE_HTTP_PATH = "/api/v1/admin/data/reconcile";

export interface DataSourceQueryPort {
  query(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope): Promise<SourceQueryResult>;
  pivot?(resolved: ResolvedDataQuery, auth: ApprovedWorkspaceAuthContext): Promise<{
    source: SourceQueryResult; cellCoverage: { cells: number; withData: number; undeterminable: number };
  }>;
}

export interface DataQueryServiceDependencies {
  hourly?: HourlyQueryPort;
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
  workspaceKind: ApprovedWorkspaceAuthContext["workspaceKind"],
): SourceQueryResult {
  return {
    ...result,
    ...(result.error === undefined
      ? {}
      : { error: { ...result.error, requestId } }),
    lineage: {
      ...result.lineage,
      workspaceKind,
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
  if (error instanceof HourlySourceError) {
    const message = error.code === "FORBIDDEN" ? "Hourly source escaped approved scope"
      : error.code === "SOURCE_UNAVAILABLE" ? "Account hourly source is unavailable"
      : error.code === "UPSTREAM_TIMEOUT" ? "Account hourly source timed out" : "Invalid or truncated hourly source";
    return stableError(error.code, message, error.code === "UPSTREAM_TIMEOUT", requestId);
  }
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
  workspaceKind: ApprovedWorkspaceAuthContext["workspaceKind"],
): SourceLineage {
  return {
    ...((resolved.queryId === "account.summary" || resolved.queryId === "account.trend" || resolved.queryId === "account.dimension") ? { window: {
      from: resolved.params.dateFrom, to: resolved.params.dateTo, preset: resolved.params.preset ?? "custom",
    } } : {}),
    workspaceKind,
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
  workspaceKind: ApprovedWorkspaceAuthContext["workspaceKind"],
): SourceQueryResult {
  return {
    queryId: resolved.queryId,
    ...(resolved.queryId === "account.dimension" ? { dimension: resolved.params.dimensionType } : {}),
    rowSchemaVersion: resolved.rowSchemaVersion,
    status: "unavailable",
    rows: [],
    returnedRowCount: 0,
    wholeResultTotal: { value: null, availability: "error", reason: error.code },
    lineage: unavailableLineage(resolved, source, workspaceKind),
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
  const parsed = sourceQueryResultSchema.safeParse({ ...result, lineage: { ...result?.lineage,
    workspaceKind: scope.scopeKind === "team_workspace_readonly" ? "team" : "personal",
  } });
  if (!parsed.success || parsed.data.queryId !== resolved.queryId) {
    throw new OutputContractError();
  }
  result = parsed.data;
  if (resolved.queryId === "account.summary" || resolved.queryId === "account.trend" || resolved.queryId === "account.dimension" || resolved.queryId === "account.pivot2") {
    const window = result.lineage.window;
    if (!window || window.from !== resolved.params.dateFrom || window.to !== resolved.params.dateTo ||
      window.preset !== (resolved.params.preset ?? "custom")) throw new OutputContractError();
    if (result.status === "ready" && resolved.queryId === "account.summary" && result.rows.some((row) => {
      const compare = row.compare as { mode?: unknown } | undefined;
      return resolved.params.compare === undefined ? compare !== undefined : compare?.mode !== resolved.params.compare;
    })) throw new OutputContractError();
  }
  if (result.status === "unavailable") {
    if (result.error?.code === "UPSTREAM_INVALID_RESPONSE") throw new OutputContractError();
    return result;
  }
  if (resolved.queryId === "account.dimension" && result.dimension !== resolved.params.dimensionType) throw new OutputContractError();
  const allowed = new Set(
    scope.accounts.map((account) => `${account.media}\u0000${account.accountId}`),
  );
  if (resolved.queryId === "account.pivot2") {
    if (result.dimA !== resolved.params.dimA || result.dimB !== resolved.params.dimB) throw new OutputContractError();
    if (result.lineage.truncated || result.rows.length > resolved.maxRows) throw new OutputContractError();
    if (scope.scopeKind === "explicit_accounts" && (result.lineage.coverage.requestedObjects !== scope.accounts.length ||
      (result.lineage.coverage.returnedObjects !== undefined && result.lineage.coverage.returnedObjects > scope.accounts.length) ||
      (result.lineage.coverage.complete && result.lineage.coverage.returnedObjects !== scope.accounts.length))) throw new OutputContractError();
    for (const row of result.rows) for (const [side, dim] of [["a", result.dimA], ["b", result.dimB]] as const) {
      if (dim !== "account") continue;
      const key = (row[side] as { key: string }).key, separator = key.indexOf(":");
      if (scope.scopeKind === "explicit_accounts" && !allowed.has(`${key.slice(0, separator)}\u0000${key.slice(separator + 1)}`)) throw new OutputScopeError();
    }
  }
  for (const row of result.rows) {
    if (resolved.outputShape === "account_rows" && resolved.params.taskId !== undefined && (!Array.isArray(row.tasks) || !row.tasks.some((task: unknown) =>
      typeof task === "object" && task !== null && "taskId" in task && task.taskId === resolved.params.taskId))) {
      throw new OutputContractError();
    }
    const identity = rowAccountIdentity(row);
    // Frozen dimension rows omit workspaceId. The trusted adapter validates the
    // internal three-key identity; this boundary still enforces every approved pair.
    if (resolved.queryId === "account.dimension" && result.dimension === "account") identity.workspaceId = scope.workspaceId;
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
  const overBudget = result.rows.length > resolved.maxRows;
  if (!overBudget && !result.lineage.truncated) return result;
  // Validate every source row/scope above before slicing. A third-party adapter
  // must not bypass v2 masking by setting truncated but leaving numeric values.
  const rows = maskCanonicalQueryRows(resolved.queryId, result.rows.slice(0, resolved.maxRows), "error");
  const reason = overBudget ? "Result exceeded the registry row budget" : "Source response was truncated";
  const coverage = { ...result.lineage.coverage, complete: false, reason };
  // Counts before a local slice do not prove the object set of the returned page.
  if (overBudget) delete coverage.returnedObjects;
  return {
    ...result,
    rows,
    returnedRowCount: rows.length,
    wholeResultTotal: {
      value: null,
      availability: "partial",
      reason,
    },
    lineage: {
      ...result.lineage,
      coverage,
      truncated: true,
      partial: true,
    },
    warnings: [...new Set([...result.warnings, reason])],
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

      if (resolved.queryId === "account.gap") {
        // Frozen gapStatus requires a real versioned rule plus scoped source
        // contributions. Neither an old daily aggregate nor a constant threshold
        // is a substitute. This runs AFTER request and approved tuple validation.
        throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Versioned Gap source is not configured");
      }
      if (resolved.queryId === "account.hourly") {
        if (route.selectedSource !== "platform" || auth.workspaceKind !== "personal" || !this.dependencies.hourly)
          throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Account hourly source is not configured");
        const allowed = new Set(scope.accounts.map(a => JSON.stringify([a.media, a.accountId])));
        const filtered: ApprovedWorkspaceAuthContext = { ...auth, scope: { ...auth.scope,
          accounts: auth.scope.accounts.filter(a => allowed.has(JSON.stringify([a.media, a.accountId]))) } };
        let proof: unknown;
        // Object spread preserves the Registry's symbol brand; clone nested data
        // so a provider cannot broaden the trusted query used below for checking.
        const providerQuery = { ...resolved, params: structuredClone(resolved.params), supportedViews: [...resolved.supportedViews],
          authorityPolicy: { ...resolved.authorityPolicy } };
        try { proof = await this.dependencies.hourly.query(providerQuery, structuredClone(filtered)); }
        catch (error) {
          if (error instanceof HourlySourceError) throw error;
          throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Account hourly source is unavailable");
        }
        const source = withFrozenAuthority(validateHourlySource(proof, resolved, filtered), resolved, "platform", requestId, "personal");
        if (source.status === "unavailable") {
          if (source.error?.code === "UPSTREAM_INVALID_RESPONSE") throw new OutputContractError();
          throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Account hourly source is unavailable");
        }
        return dataQueryResponseSchema.parse({ ok: true, data: { mode: "platform", source }, meta: { requestId,
          businessDate: resolved.params.dateFrom, dataAsOf: source.lineage.dataAsOf, workspaceKind: "personal", selectedSource: "platform" } });
      }
      if (resolved.queryId === "account.pivot2") {
        if (route.selectedSource !== "platform" || auth.workspaceKind !== "personal" || !this.dependencies.platform.pivot) {
          throw new DataSourceRoutingError("SOURCE_UNAVAILABLE", "Pivot source is not configured");
        }
        // Preserve the unique approved context and its actual role/access levels;
        // only narrow its tuple list, never fabricate an auth context in an adapter.
        const allowed = new Set(scope.accounts.map(a => JSON.stringify([a.media, a.accountId])));
        const filteredAuth: ApprovedWorkspaceAuthContext = { ...auth, scope: { ...auth.scope,
          accounts: auth.scope.accounts.filter(a => allowed.has(JSON.stringify([a.media, a.accountId]))) } };
        const result = await this.dependencies.platform.pivot(resolved, structuredClone(filteredAuth));
        const source = withFrozenAuthority(guardSourceOutput(result.source, resolved, scope), resolved, "platform", requestId, auth.workspaceKind);
        const response = dataQueryResponseSchema.safeParse({ ok: true, data: { mode: "platform", source }, meta: { cellCoverage: result.cellCoverage } });
        if (!response.success) throw new OutputContractError();
        return response.data;
      }
      if (route.selectedSource === "ka_data") {
        const source = withFrozenAuthority(
          guardSourceOutput(await this.dependencies.kaData.query(resolved, scope), resolved, scope),
          resolved,
          "ka_data",
          requestId,
          auth.workspaceKind,
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
          auth.workspaceKind,
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
            auth.workspaceKind,
          )
        : unavailableSource(resolved, "ka_data", mapError(kaResult.reason, requestId), auth.workspaceKind);
      const platform = platformResult.status === "fulfilled"
        ? withFrozenAuthority(
            guardSourceOutput(platformResult.value, resolved, scope),
            resolved,
            "platform",
            requestId,
            auth.workspaceKind,
          )
        : unavailableSource(resolved, "platform", mapError(platformResult.reason, requestId), auth.workspaceKind);
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
  if (code === "VIEW_UNSUPPORTED" || code === "DIMENSION_UNSUPPORTED") return 422;
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
