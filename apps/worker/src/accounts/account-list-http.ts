import {
  accountListRequestSchema,
  accountListResponseSchema,
  type AccountListRequest,
  type AccountListResponse,
  type StableDataQueryErrorCode,
} from "@ka/domain";

export const ACCOUNT_LIST_HTTP_PATH = "/api/v1/accounts";

const ALLOWED_QUERY_PARAMETERS = new Set([
  "page", "pageSize", "q", "media", "stage", "starred", "tags", "ownerUserId", "status",
]);

export class AccountListHttpInputError extends Error {
  constructor() {
    super("Invalid account list query");
    this.name = "AccountListHttpInputError";
  }
}

function positiveInteger(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new AccountListHttpInputError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new AccountListHttpInputError();
  return parsed;
}

function booleanValue(value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new AccountListHttpInputError();
}

function tagsValue(value: string): string[] {
  if (value === "") throw new AccountListHttpInputError();
  const tags = value.split(",");
  if (tags.some((tag) => tag === "")) throw new AccountListHttpInputError();
  return tags;
}

export function parseAccountListSearch(search: URLSearchParams): AccountListRequest {
  const raw: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const [key, value] of search) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key) || seen.has(key)) throw new AccountListHttpInputError();
    seen.add(key);
    if (key === "page" || key === "pageSize") raw[key] = positiveInteger(value);
    else if (key === "starred") raw[key] = booleanValue(value);
    else if (key === "tags") raw[key] = tagsValue(value);
    else raw[key] = value;
  }
  const parsed = accountListRequestSchema.safeParse(raw);
  if (!parsed.success) throw new AccountListHttpInputError();
  return parsed.data;
}

export function accountListErrorBody(
  code: StableDataQueryErrorCode,
  message: string,
  requestId: string,
): AccountListResponse {
  return accountListResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId },
  });
}

export function accountListHttpStatus(result: AccountListResponse): number {
  if (result.ok) return 200;
  if (result.error.code === "UNAUTHORIZED") return 401;
  if (result.error.code === "FORBIDDEN") return 403;
  if (result.error.code === "UPSTREAM_INVALID_RESPONSE" || result.error.code === "SOURCE_TRUNCATED") return 502;
  if (result.error.code === "SOURCE_UNAVAILABLE") return 503;
  if (result.error.code === "UPSTREAM_TIMEOUT") return 504;
  if (result.error.code === "INTERNAL_ERROR") return 500;
  return 400;
}
