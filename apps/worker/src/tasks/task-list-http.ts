import {
  taskListRequestSchema,
  taskListResponseSchema,
  type StableDataQueryErrorCode,
  type TaskListRequest,
  type TaskListResponse,
} from "@ka/domain";

export const TASK_LIST_HTTP_PATH = "/api/v1/tasks";

const ALLOWED_QUERY_PARAMETERS = new Set([
  "page",
  "pageSize",
  "q",
  "status",
  "ownerUserId",
  "periodFrom",
  "periodTo",
  "hasOpenWorkItems",
]);

export class TaskListHttpInputError extends Error {
  constructor() {
    super("Invalid task list query");
    this.name = "TaskListHttpInputError";
  }
}

function positiveInteger(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new TaskListHttpInputError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new TaskListHttpInputError();
  return parsed;
}

function booleanValue(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new TaskListHttpInputError();
}

export function parseTaskListSearch(search: URLSearchParams): TaskListRequest {
  const raw: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const [key, value] of search) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key) || seen.has(key)) {
      throw new TaskListHttpInputError();
    }
    seen.add(key);
    if (key === "page" || key === "pageSize") {
      raw[key] = positiveInteger(value);
    } else if (key === "hasOpenWorkItems") {
      raw[key] = booleanValue(value);
    } else {
      raw[key] = value;
    }
  }
  const parsed = taskListRequestSchema.safeParse(raw);
  if (!parsed.success) throw new TaskListHttpInputError();
  return parsed.data;
}

export function taskListErrorBody(
  code: StableDataQueryErrorCode,
  message: string,
  requestId: string,
): TaskListResponse {
  return taskListResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId },
  });
}

export function taskListHttpStatus(result: TaskListResponse): number {
  if (result.ok) return 200;
  if (result.error.code === "UNAUTHORIZED") return 401;
  if (result.error.code === "FORBIDDEN") return 403;
  if (
    result.error.code === "UPSTREAM_INVALID_RESPONSE" ||
    result.error.code === "SOURCE_TRUNCATED"
  ) return 502;
  if (result.error.code === "SOURCE_UNAVAILABLE") return 503;
  if (result.error.code === "UPSTREAM_TIMEOUT") return 504;
  if (result.error.code === "INTERNAL_ERROR") return 500;
  return 400;
}
