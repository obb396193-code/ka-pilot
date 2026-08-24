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
  now?: () => Date;
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
): SourceQueryResult {
  return {
    ...result,
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
  return stableError("INTERNAL_ERROR", "The data query could not be completed", false, requestId);
}

function unavailableLineage(
  resolved: ResolvedDataQuery,
  source: "ka_data" | "platform",
  now: Date,
): SourceLineage {
  return {
    source: source === "ka_data" ? "ka_data" : "canonical",
    datasetVersion: "unavailable",
    queryTemplateVersion: resolved.queryTemplateVersion,
    metricVersion: resolved.metricVersion,
    dataAsOf: now.toISOString(),
    timezone: "Asia/Shanghai",
    dayCut: source === "ka_data" ? "calendar_day" : "platform_versioned",
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
  now: Date,
): SourceQueryResult {
  return {
    status: "unavailable",
    rows: [],
    returnedRowCount: 0,
    wholeResultTotal: { value: null, availability: "error", reason: error.code },
    lineage: unavailableLineage(resolved, source, now),
    warnings: [error.message],
    error,
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
  private readonly now: () => Date;

  constructor(private readonly dependencies: DataQueryServiceDependencies) {
    this.requestId = dependencies.requestId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
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
          await this.dependencies.kaData.query(resolved, scope),
          resolved,
          "ka_data",
        );
        return dataQueryResponseSchema.parse({ ok: true, data: { mode: "ka_data", source } });
      }
      if (request.data.dataView === "platform") {
        const source = withFrozenAuthority(
          await this.dependencies.platform.query(resolved, scope),
          resolved,
          "platform",
        );
        return dataQueryResponseSchema.parse({ ok: true, data: { mode: "platform", source } });
      }

      const [kaResult, platformResult] = await Promise.allSettled([
        this.dependencies.kaData.query(resolved, scope),
        this.dependencies.platform.query(resolved, scope),
      ]);
      const kaData = kaResult.status === "fulfilled"
        ? withFrozenAuthority(kaResult.value, resolved, "ka_data")
        : unavailableSource(resolved, "ka_data", mapError(kaResult.reason, requestId), this.now());
      const platform = platformResult.status === "fulfilled"
        ? withFrozenAuthority(platformResult.value, resolved, "platform")
        : unavailableSource(resolved, "platform", mapError(platformResult.reason, requestId), this.now());
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
