import { randomUUID } from "node:crypto";

import {
  dataQueryRequestSchema,
  dataQueryResponseSchema,
  dataQueryIdSchema,
  type DataQueryResponse,
  type SourceAuthority,
  type SourceLineage,
  type SourceQueryResult,
  type StableDataQueryError,
  type StableDataQueryErrorCode,
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
  type ScopedAccount,
} from "./query-registry.js";

export const DATA_QUERY_HTTP_PATH = "/api/v1/data/query";

export interface AuthenticatedDataQueryContext {
  workspaceId: string;
  userId: string;
  allowedAccounts: readonly ScopedAccount[];
}

export interface DataSourceQueryPort {
  query(resolved: ResolvedDataQuery, scope: DataQueryExecutionScope): Promise<SourceQueryResult>;
}

export interface DataQueryServiceDependencies {
  registry: DataQueryRegistry;
  kaData: DataSourceQueryPort;
  platform: DataSourceQueryPort;
  requestId?: () => string;
}

class OutputScopeError extends Error {
  constructor() {
    super("Data source returned rows outside the authenticated scope");
    this.name = "OutputScopeError";
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
  if (error instanceof QueryRegistryError) {
    return stableError(error.code, error.message, false, requestId);
  }
  if (error instanceof KaDataClientError) {
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
    status: "unavailable",
    rows: [],
    returnedRowCount: 0,
    wholeResultTotal: { value: null, availability: "error", reason: error.code },
    lineage: unavailableLineage(resolved, source),
    warnings: [error.message],
    error,
  };
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
  if (result.status === "unavailable") return result;
  const allowed = new Set(
    scope.accounts.map((account) => `${account.media}\u0000${account.accountId}`),
  );
  for (const row of result.rows) {
    const identity = rowAccountIdentity(row);
    const carriesIdentity = identity.media !== null || identity.accountId !== null;
    if (resolved.outputShape === "account_rows" &&
      (identity.media === null || identity.accountId === null)) {
      throw new OutputScopeError();
    }
    if (identity.workspaceId !== null && identity.workspaceId !== scope.workspaceId) {
      throw new OutputScopeError();
    }
    if (carriesIdentity && (
      identity.media === null ||
      identity.accountId === null ||
      !allowed.has(`${identity.media}\u0000${identity.accountId}`)
    )) {
      throw new OutputScopeError();
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
  auth: AuthenticatedDataQueryContext,
): DataQueryExecutionScope {
  const requested = requestedAccounts(resolved);
  const mediaFiltered = resolved.params.media === undefined
    ? auth.allowedAccounts
    : auth.allowedAccounts.filter((account) => account.media === resolved.params.media);
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
    accounts: [...uniqueAccounts.values()],
  };
}

function validateAuth(auth: AuthenticatedDataQueryContext): void {
  if (auth.workspaceId.trim() === "" || auth.userId.trim() === "") {
    throw new QueryRegistryError("INVALID_REQUEST", "Authenticated workspace and user are required");
  }
  if (auth.allowedAccounts.some(
    (account) => account.accountId.trim() === "" || account.media.trim() === "",
  )) {
    throw new QueryRegistryError("INVALID_REQUEST", "Authenticated account scope is invalid");
  }
}

export class DataQueryService {
  private readonly requestId: () => string;

  constructor(private readonly dependencies: DataQueryServiceDependencies) {
    this.requestId = dependencies.requestId ?? randomUUID;
  }

  async execute(
    requestInput: unknown,
    auth: AuthenticatedDataQueryContext,
  ): Promise<DataQueryResponse> {
    const requestId = this.requestId();
    try {
      validateAuth(auth);
      const request = dataQueryRequestSchema.safeParse(requestInput);
      if (!request.success) {
        const rawQueryId = typeof requestInput === "object" && requestInput !== null &&
          "queryId" in requestInput ? requestInput.queryId : undefined;
        const code = typeof rawQueryId === "string" && !dataQueryIdSchema.safeParse(rawQueryId).success
          ? "QUERY_NOT_ALLOWED"
          : "INVALID_REQUEST";
        return dataQueryResponseSchema.parse({
          ok: false,
          error: stableError(code, "Invalid data query request", false, requestId),
        });
      }
      const resolved = this.dependencies.registry.resolve(
        request.data.queryId,
        request.data.params,
        request.data.dataView,
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

      if (request.data.dataView === "ka_data") {
        const source = withFrozenAuthority(
          guardSourceOutput(await this.dependencies.kaData.query(resolved, scope), resolved, scope),
          resolved,
          "ka_data",
          requestId,
        );
        return dataQueryResponseSchema.parse({ ok: true, data: { mode: "ka_data", source } });
      }
      if (request.data.dataView === "platform") {
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
        : kaData.lineage.partial || platform.lineage.partial
          ? "partial_source"
          : (kaData.returnedRowCount === 0) !== (platform.returnedRowCount === 0)
            ? "source_missing"
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
  auth: AuthenticatedDataQueryContext | null;
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

export function createDataQueryHttpHandler(service: DataQueryService) {
  return async (request: DataQueryHttpRequest): Promise<DataQueryHttpResponse> => {
    if (request.method.toUpperCase() !== "POST") {
      return {
        status: 405,
        body: dataQueryResponseSchema.parse({
          ok: false,
          error: stableError("INVALID_REQUEST", "Only POST is supported", false, randomUUID()),
        }),
      };
    }
    if (request.auth === null) {
      return {
        status: 401,
        body: dataQueryResponseSchema.parse({
          ok: false,
          error: stableError("UNAUTHORIZED", "Authentication is required", false, randomUUID()),
        }),
      };
    }
    const body = await service.execute(request.body, request.auth);
    return { status: body.ok ? 200 : errorStatus(body.error.code), body };
  };
}
