import {
  accountListRequestSchema,
  accountListResponseSchema,
  safeDivide,
  shanghaiTaskBusinessDate,
  type AccountListItem,
  type AccountListRequest,
  type AccountListResponse,
  type StableDataQueryError,
} from "@ka/domain";
import type {
  AccountListRepositoryQuery,
  AccountListRepositoryResult,
  AccountListRepositoryRow,
} from "@ka/db";
import { AccountListRepositoryContractError } from "@ka/db";
import { z } from "zod";

import type { AuthenticatedDataQueryContext } from "../data/query-service.js";
import { resolveRequestId } from "../data/request-id.js";

type AccountListSourceErrorCode =
  | "SOURCE_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_INVALID_RESPONSE";

export class AccountListSourceError extends Error {
  constructor(
    readonly code: AccountListSourceErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AccountListSourceError";
  }
}

class AccountListScopeViolation extends Error {}

export interface AccountListRepositoryPort {
  list(query: AccountListRepositoryQuery): Promise<AccountListRepositoryResult>;
}

export interface AccountListServiceDependencies {
  repository: AccountListRepositoryPort;
  now?: () => Date;
}

function stableError(
  code: StableDataQueryError["code"],
  message: string,
  retryable: boolean,
  requestId: string,
): AccountListResponse {
  return accountListResponseSchema.parse({
    ok: false,
    error: { code, message, retryable, requestId },
  });
}

function validateAuth(auth: AuthenticatedDataQueryContext): boolean {
  if (
    !z.string().uuid().safeParse(auth.workspaceId).success ||
    !z.string().uuid().safeParse(auth.userId).success
  ) return false;
  const tuples = new Set<string>();
  for (const account of auth.allowedAccounts) {
    if (account.media.trim() === "" || account.accountId.trim() === "") return false;
    const key = JSON.stringify([account.media, account.accountId]);
    if (tuples.has(key)) return false;
    tuples.add(key);
  }
  return true;
}

function mapSourceError(error: AccountListSourceError, requestId: string): AccountListResponse {
  if (error.code === "SOURCE_UNAVAILABLE") {
    return stableError(error.code, "The Qihang account source is unavailable", error.retryable, requestId);
  }
  if (error.code === "UPSTREAM_TIMEOUT") {
    return stableError(error.code, "The Qihang account source timed out", error.retryable, requestId);
  }
  return stableError(
    error.code,
    "The Qihang account source returned an invalid response",
    false,
    requestId,
  );
}

function itemFor(row: AccountListRepositoryRow): AccountListItem {
  const metrics = row.metricDate === null ? null : {
    businessDate: row.metricDate,
    cost: row.cost,
    realConversion: row.realConversion,
    realCpa: safeDivide(row.cost, row.realConversion, { infiniteWhenPositiveNumerator: true }),
    assessmentPrice: row.assessmentPrice,
  };
  const balance = row.balance === null ? null : {
    value: row.balance,
    syncedAt: row.balanceSyncedAt as string,
  };
  return {
    workspaceId: row.workspaceId,
    media: row.media as "KUAISHOU",
    accountId: row.accountId,
    accountName: row.accountName,
    status: row.status,
    lifecycleStage: (row.lifecycleStage ?? "unknown") as AccountListItem["lifecycleStage"],
    starred: row.starred,
    tags: row.tags,
    owner: row.owner,
    linkedTasks: row.linkedTasks,
    metrics,
    balance,
  };
}

function latestDataAsOf(rows: readonly AccountListRepositoryRow[]): string | null {
  let latest: { value: string; timestamp: number } | null = null;
  for (const row of rows) {
    if (row.dataAsOf === null) continue;
    const timestamp = Date.parse(row.dataAsOf);
    if (!Number.isFinite(timestamp)) throw new Error("invalid dataAsOf");
    if (latest === null || timestamp > latest.timestamp) latest = { value: row.dataAsOf, timestamp };
  }
  return latest?.value ?? null;
}

function assertRepositoryResult(
  result: AccountListRepositoryResult,
  request: AccountListRequest,
  workspaceId: string,
  businessDate: string,
  allowedAccounts: readonly { media: string; accountId: string }[],
): void {
  if (
    result.page !== request.page || result.pageSize !== request.pageSize ||
    !Number.isSafeInteger(result.total) || result.total < 0 ||
    result.rows.length > result.pageSize || result.rows.length > result.total ||
    typeof result.coverageComplete !== "boolean" ||
    typeof result.metricsComplete !== "boolean" ||
    typeof result.initialFullComplete !== "boolean" ||
    (allowedAccounts.length === 0 && (result.coverageComplete || result.initialFullComplete))
  ) throw new Error("invalid repository pagination or coverage");

  const allowed = new Set(allowedAccounts.map((account) => JSON.stringify([account.media, account.accountId])));
  const returned = new Set<string>();
  for (const row of result.rows) {
    const key = JSON.stringify([row.media, row.accountId]);
    if (row.workspaceId !== workspaceId || !allowed.has(key)) throw new AccountListScopeViolation();
    if (returned.has(key)) throw new Error("duplicate account identity");
    returned.add(key);
    if (row.metricDate === null) {
      if (
        row.cost !== null || row.realConversion !== null ||
        row.assessmentPrice !== null || row.dataAsOf !== null
      ) throw new Error("metric fields require metricDate");
      if (result.metricsComplete) throw new Error("metricsComplete conflicts with missing metrics");
    } else if (row.metricDate !== businessDate) {
      throw new Error("metricDate differs from businessDate");
    } else if (result.metricsComplete && row.dataAsOf === null) {
      throw new Error("metricsComplete requires dataAsOf");
    }
    if (row.balance !== null && row.balanceSyncedAt === null) {
      throw new Error("balance requires syncedAt");
    }
  }
}

function dataState(result: AccountListRepositoryResult): "partial" | "stale" | "empty" | "ready" {
  if (!result.initialFullComplete || !result.coverageComplete) return "partial";
  if (!result.metricsComplete) return "stale";
  if (result.total === 0) return "empty";
  return "ready";
}

export class AccountListService {
  constructor(private readonly dependencies: AccountListServiceDependencies) {}

  async execute(
    requestInput: unknown,
    auth: AuthenticatedDataQueryContext | null,
    correlationId?: string,
    now?: Date,
  ): Promise<AccountListResponse> {
    const requestId = resolveRequestId(correlationId ?? null);
    if (auth === null) return stableError("UNAUTHORIZED", "Authentication is required", false, requestId);
    if (!validateAuth(auth)) {
      return stableError("FORBIDDEN", "Approved authentication context is invalid", false, requestId);
    }
    const request = accountListRequestSchema.safeParse(requestInput);
    if (!request.success) {
      return stableError("INVALID_REQUEST", "Invalid account list request", false, requestId);
    }
    const allowedAccounts = auth.allowedAccounts.filter((account) => account.media === "KUAISHOU");
    let result: AccountListRepositoryResult;
    let businessDate: string;
    try {
      businessDate = shanghaiTaskBusinessDate(now ?? this.dependencies.now?.() ?? new Date());
      result = await this.dependencies.repository.list({
        workspaceId: auth.workspaceId,
        requestingUserId: auth.userId,
        businessDate,
        allowedAccounts,
        ...request.data,
      });
    } catch (error) {
      if (error instanceof AccountListSourceError) return mapSourceError(error, requestId);
      if (error instanceof AccountListRepositoryContractError) {
        return stableError(
          "UPSTREAM_INVALID_RESPONSE",
          "The Qihang account source returned an invalid response",
          false,
          requestId,
        );
      }
      return stableError("INTERNAL_ERROR", "The account list could not be loaded", false, requestId);
    }
    try {
      assertRepositoryResult(result, request.data, auth.workspaceId, businessDate, allowedAccounts);
      return accountListResponseSchema.parse({
        ok: true,
        data: {
          items: result.rows.map(itemFor),
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
        },
        meta: {
          dataState: dataState(result),
          businessDate,
          dataAsOf: latestDataAsOf(result.rows),
          coverage: { complete: result.initialFullComplete && result.coverageComplete },
          selectedSource: "qihang",
          requestId,
        },
      });
    } catch (error) {
      if (error instanceof AccountListScopeViolation) {
        return stableError("FORBIDDEN", "Account source returned data outside the approved scope", false, requestId);
      }
      return stableError(
        "UPSTREAM_INVALID_RESPONSE",
        "The Qihang account source returned an invalid response",
        false,
        requestId,
      );
    }
  }
}
