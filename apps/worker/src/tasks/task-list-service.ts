import {
  computeTaskPacing,
  deriveSystemReadiness,
  mergeReadiness,
  shanghaiTaskBusinessDate,
  taskListRequestSchema,
  taskListResponseSchema,
  type ReadinessDimension,
  type StableDataQueryError,
  type TaskListItem,
  type TaskListPacing,
  type TaskListRequest,
  type TaskListResponse,
} from "@ka/domain";
import type {
  TaskListRepositoryQuery,
  TaskListRepositoryResult,
  TaskListRepositoryRow,
} from "@ka/db";

import {
  repositoryBusinessReadScope,
  validBusinessReadAuth,
} from "../auth/business-read-auth.js";
import { resolveRequestId } from "../data/request-id.js";

type TaskListSourceErrorCode =
  | "SOURCE_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_INVALID_RESPONSE";

export class TaskListSourceError extends Error {
  constructor(
    readonly code: TaskListSourceErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "TaskListSourceError";
  }
}

export interface TaskListRepositoryPort {
  list(query: TaskListRepositoryQuery): Promise<TaskListRepositoryResult>;
}

export interface TaskListServiceDependencies {
  repository: TaskListRepositoryPort;
  now?: () => Date;
}

function stableError(
  code: StableDataQueryError["code"],
  message: string,
  retryable: boolean,
  requestId: string,
): TaskListResponse {
  return taskListResponseSchema.parse({
    ok: false,
    error: { code, message, retryable, requestId },
  });
}

function mapSourceError(error: TaskListSourceError, requestId: string): TaskListResponse {
  if (error.code === "SOURCE_UNAVAILABLE") {
    return stableError(
      error.code,
      "The Qihang task source is unavailable",
      error.retryable,
      requestId,
    );
  }
  if (error.code === "UPSTREAM_TIMEOUT") {
    return stableError(
      error.code,
      "The Qihang task source timed out",
      error.retryable,
      requestId,
    );
  }
  return stableError(
    error.code,
    "The Qihang task source returned an invalid response",
    false,
    requestId,
  );
}

function pacingFor(row: TaskListRepositoryRow, businessDate: string): TaskListPacing | null {
  if (row.periodStart === null || row.periodEnd === null) return null;
  const pacing = computeTaskPacing({
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    asOf: businessDate,
    targetVolume: row.targetVolume,
    completedVolume: row.completedVolume,
    budget: row.budget,
    spent: row.spent,
    recentDailyVolumes: row.recentDailyVolumes,
  });
  return {
    asOf: businessDate,
    elapsedDays: pacing.elapsedDays,
    totalDays: pacing.totalDays,
    remainingDays: pacing.remainingDays,
    targetProgress: pacing.targetProgress,
    timeProgress: pacing.timeProgress,
    projectedVolume: pacing.projectedVolume,
    projectedCompletion: pacing.projectedCompletion,
    projectedGap: pacing.projectedGap,
    requiredDailyVolume: pacing.requiredDailyVolume,
    budgetProgress: pacing.budgetProgress,
  };
}

function itemFor(row: TaskListRepositoryRow, businessDate: string): TaskListItem {
  const period = row.periodStart === null || row.periodEnd === null
    ? null
    : { start: row.periodStart, end: row.periodEnd };
  const volume = row.targetVolume === null && row.completedVolume === null
    ? null
    : { target: row.targetVolume, completed: row.completedVolume };
  return {
    taskId: row.taskId,
    taskName: row.taskName,
    bizName: row.bizName,
    status: row.status as TaskListItem["status"],
    period,
    owner: row.owner,
    assessmentPrice: row.assessmentPrice,
    volume,
    pacing: pacingFor(row, businessDate),
    linkedAccountCount: row.linkedAccountCount,
    workItemSummary: row.workItemSummary,
    // v1.5.1 ②（S6）：阶段直接透传；六段就绪度由 domain 的纯函数从仓储取出的事实推，
    // 服务层不自己编任何一段（products/materials/strategy 没有系统来源 → undefined 不是 0）。
    stage: (row.stage ?? "preparing") as TaskListItem["stage"],
    stageSource: (row.stageSource ?? "system") as TaskListItem["stageSource"],
    readiness: mergeReadiness(
      deriveSystemReadiness(row.readinessFacts),
      row.readinessOverrides.map((entry) => ({
        dimension: entry.dimension as ReadinessDimension,
        ready: entry.ready,
      })),
    ),
    // 下一个里程碑要的是任务日历/SOP 排期，本批没有源 → null，不拿 period_end 冒充。
    nextMilestone: null,
  };
}

function latestDataAsOf(rows: readonly TaskListRepositoryRow[]): string | null {
  let latest: { value: string; timestamp: number } | null = null;
  for (const row of rows) {
    if (row.dataAsOf === null) continue;
    const timestamp = Date.parse(row.dataAsOf);
    if (!Number.isFinite(timestamp)) throw new Error("invalid dataAsOf");
    if (latest === null || timestamp > latest.timestamp) {
      latest = { value: row.dataAsOf, timestamp };
    }
  }
  return latest?.value ?? null;
}

function assertRepositoryResult(
  result: TaskListRepositoryResult,
  request: TaskListRequest,
  workspaceId: string,
  businessDate: string,
): void {
  if (
    result.page !== request.page ||
    result.pageSize !== request.pageSize ||
    !Number.isSafeInteger(result.total) ||
    result.total < 0 ||
    result.rows.length > result.pageSize ||
    result.rows.length > result.total ||
    typeof result.initialFullComplete !== "boolean"
  ) {
    throw new Error("invalid repository pagination");
  }
  const taskIds = new Set<string>();
  for (const row of result.rows) {
    if (
      row.workspaceId !== workspaceId ||
      row.linkedAccountCount > row.totalLinkedAccountCount ||
      row.linkedAccountCount < 0 ||
      row.totalLinkedAccountCount < 0 ||
      (result.coverageComplete && row.linkedAccountCount !== row.totalLinkedAccountCount)
    ) {
      throw new Error("invalid repository scope coverage");
    }
    if (taskIds.has(row.taskId)) throw new Error("duplicate task identity");
    taskIds.add(row.taskId);
    if (row.latestMetricDate !== null && row.latestMetricDate > businessDate) {
      throw new Error("future metric date");
    }
  }
}

function dataState(
  result: TaskListRepositoryResult,
  businessDate: string,
): "partial" | "stale" | "empty" | "ready" {
  if (!result.initialFullComplete) return "partial";
  if (!result.coverageComplete) return "partial";
  const stale = result.rows.some((row) =>
    row.linkedAccountCount > 0 && row.latestMetricDate !== businessDate,
  );
  if (stale) return "stale";
  if (result.total === 0) return "empty";
  return "ready";
}

export class TaskListService {
  constructor(private readonly dependencies: TaskListServiceDependencies) {}

  async execute(
    requestInput: unknown,
    auth: unknown,
    correlationId?: string,
    now?: Date,
  ): Promise<TaskListResponse> {
    const requestId = resolveRequestId(correlationId ?? null);
    if (auth === null) {
      return stableError(
        "UNAUTHORIZED",
        "Authentication is required",
        false,
        requestId,
      );
    }
    if (!validBusinessReadAuth(auth)) {
      return stableError(
        "FORBIDDEN",
        "Approved authentication context is invalid",
        false,
        requestId,
      );
    }
    const request = taskListRequestSchema.safeParse(requestInput);
    if (!request.success) {
      return stableError(
        "INVALID_REQUEST",
        "Invalid task list request",
        false,
        requestId,
      );
    }
    let result: TaskListRepositoryResult;
    let businessDate: string;
    try {
      const scope = repositoryBusinessReadScope(auth);
      businessDate = shanghaiTaskBusinessDate(
        now ?? this.dependencies.now?.() ?? new Date(),
      );
      result = await this.dependencies.repository.list({
        workspaceId: auth.workspaceId,
        requestingUserId: auth.userId,
        businessDate,
        scopeKind: scope.scopeKind,
        allowedAccounts: scope.allowedAccounts,
        ...request.data,
      });
    } catch (error) {
      if (error instanceof TaskListSourceError) return mapSourceError(error, requestId);
      return stableError(
        "INTERNAL_ERROR",
        "The task list could not be loaded",
        false,
        requestId,
      );
    }
    try {
      assertRepositoryResult(result, request.data, auth.workspaceId, businessDate);
      return taskListResponseSchema.parse({
        ok: true,
        data: {
          items: result.rows.map((row) => itemFor(row, businessDate)),
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
        },
        meta: {
          dataState: dataState(result, businessDate),
          businessDate,
          dataAsOf: latestDataAsOf(result.rows),
          coverage: { complete: result.coverageComplete && result.initialFullComplete },
          selectedSource: "qihang",
          requestId,
        },
      });
    } catch {
      return stableError(
        "UPSTREAM_INVALID_RESPONSE",
        "The Qihang task source returned an invalid response",
        false,
        requestId,
      );
    }
  }
}
