import type { IncomingMessage, ServerResponse } from "node:http";

import { R014RepositoryError } from "@ka/db";

// be2 自带一份响应/错误件。刻意复制而不是共用 http-server.ts 里的私有函数：
// 所有权边界要求 be2 需要什么就自己带一份，不去改壳层（分工文档 §2）。
const REQUEST_ID_HEADER = "x-request-id";

export type R014ErrorCode =
  | "INVALID_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT"
  | "SOURCE_UNAVAILABLE" | "SOURCE_TRUNCATED" | "INTERNAL_ERROR"
  /** v1.9.9：改密限速（429，retryable）。 */
  | "RATE_LIMITED"
  /** v1.9.9 F-Q024-1：当前密码不正确（401）。fixture `auth/password-error.json` 冻的就是它。 */
  | "INVALID_CREDENTIALS"
  /** v1.9.6：访客（viewer）只读，任何写请求 403。 */
  | "READ_ONLY_ROLE"
  /** 契约点名「一期不做」的页签：501 让前端能把「不做」和「路径写错」分开。 */
  | "NOT_IMPLEMENTED";

/** 只有「等会儿再来能成」的才是 retryable；限速属于这一类，其余一律 false。 */
const RETRYABLE_CODES = new Set<R014ErrorCode>(["RATE_LIMITED", "SOURCE_UNAVAILABLE", "INVALID_CREDENTIALS"]);

export function errorBody(
  code: R014ErrorCode, message: string, requestId: string, details?: Record<string, unknown>,
): unknown {
  return {
    ok: false,
    error: {
      code, message, retryable: RETRYABLE_CODES.has(code), requestId,
      // v1.9.28 批量保存要回「哪几条为什么失败」。details 只装**代码自己造的结构化清单**，
      // 不透传内部错误细节——稳定 envelope 那条不变。
      ...(details === undefined ? {} : { details }),
    },
  };
}

export function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  requestId: string,
): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
  });
  response.end(body);
}

/** 超过响应上限时回 502 而不是把巨大的 body 推出去（与壳层同一策略）。 */
export function sendData(
  response: ServerResponse,
  data: unknown,
  requestId: string,
  maxResponseBytes: number,
  meta: Record<string, unknown> = {},
): void {
  const payload = { ok: true, data, meta: { requestId, ...meta } };
  if (Buffer.byteLength(JSON.stringify(payload)) >= maxResponseBytes) {
    sendJson(response, 502, errorBody("SOURCE_TRUNCATED", "Response exceeds the configured limit", requestId), requestId);
    return;
  }
  sendJson(response, 200, payload, requestId);
}

export function sendEmpty(response: ServerResponse, requestId: string): void {
  response.writeHead(204, { "cache-control": "no-store", [REQUEST_ID_HEADER]: requestId });
  response.end();
}

export class R014HttpError extends Error {
  constructor(
    readonly status: number, readonly code: R014ErrorCode, message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "R014HttpError";
  }
}

export async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new R014HttpError(413, "INVALID_REQUEST", "Request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new R014HttpError(400, "INVALID_REQUEST", "Request body is not valid JSON");
  }
}

const REPOSITORY_STATUS: Record<string, { status: number; code: R014ErrorCode }> = {
  FORBIDDEN: { status: 403, code: "FORBIDDEN" },
  INVALID_INPUT: { status: 400, code: "INVALID_REQUEST" },
  NOT_FOUND: { status: 404, code: "NOT_FOUND" },
  CONFLICT: { status: 409, code: "CONFLICT" },
  INVALID_CREDENTIALS: { status: 401, code: "INVALID_CREDENTIALS" },
  INVALID_RESULT: { status: 500, code: "INTERNAL_ERROR" },
};

/**
 * 仓储错误 → HTTP。**message 一律用固定文案**，不把仓储/SQL 的原文透出去
 * （契约：错误 message 不透传上游响应正文、SQL、token 或内部堆栈）。
 */
export function sendFailure(response: ServerResponse, error: unknown, requestId: string): void {
  if (error instanceof R014HttpError) {
    sendJson(response, error.status,
      errorBody(error.code, error.message, requestId, error.details), requestId);
    return;
  }
  if (error instanceof R014RepositoryError) {
    const mapped = REPOSITORY_STATUS[error.code] ?? { status: 500, code: "INTERNAL_ERROR" as const };
    sendJson(response, mapped.status, errorBody(mapped.code, MESSAGES[mapped.code], requestId), requestId);
    return;
  }
  // 稳定 envelope 不透传内部细节；排障时用 R014_DEBUG_ERRORS=1 把真因打到 stderr，
  // 响应体永远只有固定文案。
  if (process.env.R014_DEBUG_ERRORS === "1") {
    process.stderr.write(`R014 debug: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
  sendJson(response, 500, errorBody("INTERNAL_ERROR", MESSAGES.INTERNAL_ERROR, requestId), requestId);
}

const MESSAGES: Record<R014ErrorCode, string> = {
  INVALID_REQUEST: "The request is not valid",
  UNAUTHORIZED: "Authentication is required",
  FORBIDDEN: "The caller is not allowed to access this resource",
  NOT_FOUND: "The resource does not exist",
  CONFLICT: "The resource is in a conflicting state",
  SOURCE_UNAVAILABLE: "A required source is not available",
  SOURCE_TRUNCATED: "Response exceeds the configured limit",
  INTERNAL_ERROR: "The request could not be completed",
  RATE_LIMITED: "Too many attempts, try again later",
  // 文案照 fixture 冻的原话；**同一句话覆盖「密码错」和「从没设过密码」两种情况**，
  // 分开说等于告诉外人这个身份有没有设过密码。
  INVALID_CREDENTIALS: "当前密码不正确",
  READ_ONLY_ROLE: "访客账号只能查看，不能修改",
  NOT_IMPLEMENTED: "This capability is not part of the first release",
};

export function requireMethod(request: IncomingMessage, allowed: readonly string[]): string {
  const method = (request.method ?? "").toUpperCase();
  if (!allowed.includes(method)) {
    throw new R014HttpError(405, "INVALID_REQUEST", `Only ${allowed.join(", ")} is supported`);
  }
  return method;
}

/**
 * 把处理函数包成 R014Route：统一兜住抛出的错误，避免任何一条路由把异常漏给壳层
 * （壳层会当成未处理异常整体 500，丢掉我们的稳定错误 envelope）。
 * 放在 http.ts 而不是各路由文件里，是为了所有路由共用同一套失败语义。
 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function guardedRoute(
  matches: (pathname: string) => boolean,
  handle: (context: import("./routes.js").R014RouteContext) => Promise<void>,
): import("./routes.js").R014Route {
  return {
    matches,
    handle: async (context) => {
      try {
        // v1.9.6：viewer 的写请求在**路由层统一挡掉**，不指望每个仓储各自记得判——
        // 少判一处就是一个访客能写的洞。读请求照常放行。
        const method = (context.request.method ?? "GET").toUpperCase();
        if (context.auth.role === "viewer" && !READ_METHODS.has(method)) {
          throw new R014HttpError(403, "READ_ONLY_ROLE", MESSAGES.READ_ONLY_ROLE);
        }
        await handle(context);
      } catch (error) {
        sendFailure(context.response, error, context.requestId);
      }
    },
  };
}
