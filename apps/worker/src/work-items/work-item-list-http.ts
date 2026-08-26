import {
  workItemListRequestSchema,
  workItemListResponseSchema,
  type StableDataQueryErrorCode,
  type WorkItemListRequest,
  type WorkItemListResponse,
} from "@ka/domain";

export const WORK_ITEM_LIST_HTTP_PATH = "/api/v1/work-items";

const ALLOWED_QUERY_PARAMETERS = new Set([
  "page", "pageSize", "q", "status", "severity", "type",
  "assigneeUserId", "taskId",
]);

export class WorkItemListHttpInputError extends Error {
  constructor() {
    super("Invalid work item list query");
    this.name = "WorkItemListHttpInputError";
  }
}

function positiveInteger(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new WorkItemListHttpInputError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new WorkItemListHttpInputError();
  return parsed;
}

export function parseWorkItemListSearch(search: URLSearchParams): WorkItemListRequest {
  const raw: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const [key, value] of search) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key) || seen.has(key)) {
      throw new WorkItemListHttpInputError();
    }
    seen.add(key);
    raw[key] = key === "page" || key === "pageSize" ? positiveInteger(value) : value;
  }
  const parsed = workItemListRequestSchema.safeParse(raw);
  if (!parsed.success) throw new WorkItemListHttpInputError();
  return parsed.data;
}

export function workItemListErrorBody(
  code: StableDataQueryErrorCode,
  message: string,
  requestId: string,
): WorkItemListResponse {
  return workItemListResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId },
  });
}

export function workItemListHttpStatus(result: WorkItemListResponse): number {
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
