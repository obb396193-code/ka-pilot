import {
  shanghaiTaskBusinessDate,
  workItemListRequestSchema,
  workItemListResponseSchema,
  type StableDataQueryError,
  type WorkItemListItem,
  type WorkItemListRequest,
  type WorkItemListResponse,
} from "@ka/domain";
import type {
  WorkItemListRepositoryQuery,
  WorkItemListRepositoryResult,
  WorkItemListRepositoryRow,
} from "@ka/db";
import { WorkItemListRepositoryContractError } from "@ka/db";
import { z } from "zod";

import type { AuthenticatedDataQueryContext } from "../data/query-service.js";
import { resolveRequestId } from "../data/request-id.js";

type WorkItemListSourceErrorCode =
  | "SOURCE_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_INVALID_RESPONSE";

export class WorkItemListSourceError extends Error {
  constructor(
    readonly code: WorkItemListSourceErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WorkItemListSourceError";
  }
}

class WorkItemListScopeViolation extends Error {}

export interface WorkItemListRepositoryPort {
  list(query: WorkItemListRepositoryQuery): Promise<WorkItemListRepositoryResult>;
}

export interface WorkItemListServiceDependencies {
  repository: WorkItemListRepositoryPort;
  now?: () => Date;
}

function stableError(
  code: StableDataQueryError["code"],
  message: string,
  retryable: boolean,
  requestId: string,
): WorkItemListResponse {
  return workItemListResponseSchema.parse({
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

function mapSourceError(error: WorkItemListSourceError, requestId: string): WorkItemListResponse {
  if (error.code === "SOURCE_UNAVAILABLE") {
    return stableError(error.code, "The work item source is unavailable", error.retryable, requestId);
  }
  if (error.code === "UPSTREAM_TIMEOUT") {
    return stableError(error.code, "The work item source timed out", error.retryable, requestId);
  }
  return stableError(error.code, "The work item source returned an invalid response", false, requestId);
}

function accountFor(row: WorkItemListRepositoryRow): WorkItemListItem["account"] {
  if (row.media === null && row.accountId === null) return null;
  return {
    workspaceId: row.workspaceId,
    media: row.media as string,
    accountId: row.accountId as string,
    accountName: row.accountName,
  };
}

function itemFor(row: WorkItemListRepositoryRow): WorkItemListItem {
  const task = row.taskId === null
    ? null
    : { taskId: row.taskId, taskName: row.taskName };
  const assignee = row.assigneeUserId === null || row.assigneeDisplayName === null
    ? null
    : { userId: row.assigneeUserId, displayName: row.assigneeDisplayName };
  return {
    workItemId: row.workItemId,
    type: row.type as WorkItemListItem["type"],
    status: row.status as WorkItemListItem["status"],
    severity: row.severity as WorkItemListItem["severity"],
    title: row.title,
    account: accountFor(row),
    task,
    assignee,
    slaDue: row.slaDue,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

function assertRepositoryResult(
  result: WorkItemListRepositoryResult,
  request: WorkItemListRequest,
  auth: AuthenticatedDataQueryContext,
): void {
  const pageOffset = (result.page - 1) * result.pageSize;
  const pageRangeInvalid = result.rows.length === 0
    ? pageOffset < result.total
    : pageOffset + result.rows.length > result.total;
  if (
    result.page !== request.page || result.pageSize !== request.pageSize ||
    !Number.isSafeInteger(result.total) || result.total < 0 ||
    !Number.isSafeInteger(result.accountItemCount) || result.accountItemCount < 0 ||
    result.accountItemCount > result.total ||
    result.rows.length > result.pageSize || result.rows.length > result.total ||
    pageRangeInvalid ||
    typeof result.coverageComplete !== "boolean" ||
    typeof result.initialFullComplete !== "boolean" ||
    (result.total === 0 && result.dataAsOf !== null) ||
    (result.total > 0 && result.dataAsOf === null)
  ) throw new Error("invalid repository pagination, coverage or lineage");
  if (result.dataAsOf !== null && !z.string().datetime({ offset: true }).safeParse(result.dataAsOf).success) {
    throw new Error("invalid repository dataAsOf");
  }

  const allowed = new Set(auth.allowedAccounts.map((account) =>
    JSON.stringify([account.media, account.accountId])));
  const ids = new Set<string>();
  let pageAccountItems = 0;
  const lineageTime = result.dataAsOf === null ? null : Date.parse(result.dataAsOf);
  for (const row of result.rows) {
    if (row.workspaceId !== auth.workspaceId) throw new WorkItemListScopeViolation();
    if (ids.has(row.workItemId)) throw new Error("duplicate work item identity");
    ids.add(row.workItemId);

    const isAccountItem = row.media !== null || row.accountId !== null;
    if (isAccountItem) {
      pageAccountItems += 1;
      if (
        row.media === null || row.accountId === null ||
        !allowed.has(JSON.stringify([row.media, row.accountId]))
      ) throw new WorkItemListScopeViolation();
    } else if (row.assigneeUserId !== auth.userId && row.creatorUserId !== auth.userId) {
      throw new WorkItemListScopeViolation();
    }
    if (row.media === null && row.accountName !== null) {
      throw new Error("accountName requires account identity");
    }
    if (row.taskId === null && row.taskName !== null) {
      throw new Error("taskName requires taskId");
    }
    if (row.assigneeUserId === null && row.assigneeDisplayName !== null) {
      throw new Error("assignee display name requires assignee id");
    }
    const rowActivityTime = Math.max(
      Date.parse(row.createdAt),
      row.resolvedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(row.resolvedAt),
    );
    if (
      lineageTime !== null &&
      Number.isFinite(rowActivityTime) &&
      rowActivityTime > lineageTime
    ) throw new Error("dataAsOf predates a returned work item");
  }
  if (
    (pageAccountItems > 0 && result.accountItemCount === 0) ||
    (auth.allowedAccounts.length === 0 && result.accountItemCount > 0)
  ) throw new Error("accountItemCount conflicts with returned or approved account scope");
}

function dataState(result: WorkItemListRepositoryResult): "partial" | "stale" | "empty" | "ready" {
  if (!result.coverageComplete) return "partial";
  if (result.accountItemCount > 0 && !result.initialFullComplete) return "stale";
  if (result.total === 0) return "empty";
  return "ready";
}

export class WorkItemListService {
  constructor(private readonly dependencies: WorkItemListServiceDependencies) {}

  async execute(
    requestInput: unknown,
    auth: AuthenticatedDataQueryContext | null,
    correlationId?: string,
    now?: Date,
  ): Promise<WorkItemListResponse> {
    const requestId = resolveRequestId(correlationId ?? null);
    if (auth === null) return stableError("UNAUTHORIZED", "Authentication is required", false, requestId);
    if (!validateAuth(auth)) {
      return stableError("FORBIDDEN", "Approved authentication context is invalid", false, requestId);
    }
    const request = workItemListRequestSchema.safeParse(requestInput);
    if (!request.success) {
      return stableError("INVALID_REQUEST", "Invalid work item list request", false, requestId);
    }

    let result: WorkItemListRepositoryResult;
    let businessDate: string;
    try {
      businessDate = shanghaiTaskBusinessDate(now ?? this.dependencies.now?.() ?? new Date());
      result = await this.dependencies.repository.list({
        workspaceId: auth.workspaceId,
        requestingUserId: auth.userId,
        businessDate,
        allowedAccounts: auth.allowedAccounts,
        ...request.data,
      });
    } catch (error) {
      if (error instanceof WorkItemListSourceError) return mapSourceError(error, requestId);
      if (error instanceof WorkItemListRepositoryContractError) {
        return stableError(
          "UPSTREAM_INVALID_RESPONSE",
          "The work item source returned an invalid response",
          false,
          requestId,
        );
      }
      return stableError("INTERNAL_ERROR", "The work item list could not be loaded", false, requestId);
    }

    try {
      assertRepositoryResult(result, request.data, auth);
      return workItemListResponseSchema.parse({
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
          dataAsOf: result.dataAsOf,
          coverage: { complete: result.coverageComplete },
          selectedSource: "platform",
          requestId,
        },
      });
    } catch (error) {
      if (error instanceof WorkItemListScopeViolation) {
        return stableError("FORBIDDEN", "Work item source violated the approved scope", false, requestId);
      }
      return stableError(
        "UPSTREAM_INVALID_RESPONSE",
        "The work item source returned an invalid response",
        false,
        requestId,
      );
    }
  }
}
