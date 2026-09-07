import { timingSafeEqual } from "node:crypto";
import { findR014Route } from "../r014/routes.js";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  dataQueryResponseSchema,
  readDetailResponseSchema,
  sessionErrorResponseSchema,
  type ApprovedWorkspaceAuthContext,
  type DataQueryResponse,
  type ReadDetailResponse,
} from "@ka/domain";

import {
  ACCOUNT_LIST_HTTP_PATH,
  accountListErrorBody,
  AccountListHttpInputError,
  accountListHttpStatus,
  parseAccountListSearch,
} from "../accounts/account-list-http.js";
import type { AccountListService } from "../accounts/account-list-service.js";
import {
  createDataQueryHttpHandler,
  DATA_QUERY_HTTP_PATH,
  SEMANTIC_QUERY_HTTP_PATH,
  ADMIN_RECONCILE_HTTP_PATH,
  type DataQueryService,
} from "./query-service.js";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id.js";
import { semanticQueryRequestSchema } from "./semantic-query-request.js";
import type { ReadDetailService } from "./read-detail-service.js";
import {
  parseTaskListSearch,
  TASK_LIST_HTTP_PATH,
  taskListErrorBody,
  TaskListHttpInputError,
  taskListHttpStatus,
} from "../tasks/task-list-http.js";
import type { TaskListService } from "../tasks/task-list-service.js";
import {
  parseWorkItemListSearch,
  WORK_ITEM_LIST_HTTP_PATH,
  workItemListErrorBody,
  WorkItemListHttpInputError,
  workItemListHttpStatus,
} from "../work-items/work-item-list-http.js";
import type { WorkItemListService } from "../work-items/work-item-list-service.js";
import {
  AUTH_LOGIN_HTTP_PATH,
  AUTH_SESSION_HTTP_PATH,
  AUTH_WORKSPACES_HTTP_PATH,
  AUTH_WORKSPACE_HTTP_PATH,
  clearedSessionCookie,
  parseSessionCookie,
  SESSION_HTTP_PATHS,
  sessionCookie,
  sessionInputError,
  sessionInternalError,
  sessionMethodError,
  sessionTruncatedError,
  type SessionHttpResult,
  type SessionHttpService,
} from "../auth/session-http.js";
import type { SessionAuthService } from "../auth/session-auth-service.js";


// arch 开的缝：R-014 路由由 be2 在 src/r014/routes.ts 注册
import { findR014Route } from "../r014/routes.js";
export const DEFAULT_DATA_API_MAX_REQUEST_BYTES = 1024 * 1024;
export const DEFAULT_DATA_API_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export interface DataApiServerOptions {
  service: DataQueryService;
  detailService: ReadDetailService;
  taskListService: TaskListService;
  accountListService: AccountListService;
  workItemListService: WorkItemListService;
  internalToken: string;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  sessionHttpService?: SessionHttpService;
  sessionAuthService?: SessionAuthService;
}

export type { ServerDataSourcePolicy as DataQueryAccessPolicy } from "./data-source-routing.js";

type DetailRoute = { kind: "work_item" | "changeset"; id: string };

function detailRoute(pathname: string): DetailRoute | null {
  const workItem = /^\/api\/v1\/work-items\/([^/]+)$/.exec(pathname);
  if (workItem?.[1] !== undefined) return { kind: "work_item", id: workItem[1] };
  const changeset = /^\/api\/v1\/changesets\/([^/]+)$/.exec(pathname);
  return changeset?.[1] === undefined ? null : { kind: "changeset", id: changeset[1] };
}

class HttpInputError extends Error {
  constructor(readonly status: number, readonly code: "INVALID_REQUEST" | "FORBIDDEN") {
    super(code);
    this.name = "HttpInputError";
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) throw new Error("HTTP byte limits must be positive integers");
  return resolved;
}

function constantTimeTokenEquals(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

function header(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" ? value : null;
}

type BusinessAuthentication =
  | { status: "approved"; auth: ApprovedWorkspaceAuthContext }
  | { status: "missing" }
  | { status: "forbidden" };

async function authenticateBusinessCaller(
  request: IncomingMessage,
  internalToken: string,
  sessionAuthService: SessionAuthService | undefined,
): Promise<BusinessAuthentication> {
  const internalCaller = authenticateInternalCaller(request, internalToken);
  if (internalCaller !== "approved") return { status: internalCaller };
  if (sessionAuthService === undefined) return { status: "missing" };
  const token = parseSessionCookie(header(request, "cookie"));
  if (token === null) return { status: "missing" };
  const resolution = await sessionAuthService.resolve(token);
  return resolution.status === "approved"
    ? { status: "approved", auth: resolution.context }
    : { status: resolution.httpStatus === 401 ? "missing" : "forbidden" };
}

function authenticateInternalCaller(
  request: IncomingMessage,
  internalToken: string,
): "approved" | "missing" | "forbidden" {
  const authorization = header(request, "authorization");
  if (authorization === null) return "missing";
  return constantTimeTokenEquals(authorization, `Bearer ${internalToken}`)
    ? "approved"
    : "forbidden";
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maxBytes) throw new HttpInputError(413, "INVALID_REQUEST");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpInputError(400, "INVALID_REQUEST");
  }
}

function errorBody(
  code: "INVALID_REQUEST" | "FORBIDDEN" | "SOURCE_TRUNCATED" | "VIEW_UNSUPPORTED",
  message: string,
  requestId: string,
): DataQueryResponse {
  return dataQueryResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId },
  });
}

function detailErrorBody(
  code: "INVALID_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "SOURCE_TRUNCATED" | "INTERNAL_ERROR",
  message: string,
  requestId: string,
): ReadDetailResponse {
  return readDetailResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId },
  });
}

function detailStatus(result: ReadDetailResponse): number {
  if (result.ok) return 200;
  if (result.error.code === "UNAUTHORIZED") return 401;
  if (result.error.code === "FORBIDDEN") return 403;
  if (result.error.code === "NOT_FOUND") return 404;
  if (result.error.code === "SOURCE_TRUNCATED") return 502;
  if (result.error.code === "INVALID_REQUEST") return 400;
  return 500;
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
    [REQUEST_ID_HEADER]: requestId,
    ...extraHeaders,
  });
  response.end(body);
}

function sendBoundedJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  requestId: string,
  maxBytes: number,
  limitError: () => unknown,
  extraHeaders: Record<string, string> = {},
): boolean {
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) >= maxBytes) {
    sendJson(response, 502, limitError(), requestId);
    return false;
  }
  sendJson(response, status, payload, requestId, extraHeaders);
  return true;
}

function sessionMethodAllowed(pathname: string, method: string): boolean {
  if (pathname === AUTH_LOGIN_HTTP_PATH || pathname === AUTH_WORKSPACE_HTTP_PATH) {
    return method === "POST";
  }
  if (pathname === AUTH_WORKSPACES_HTTP_PATH) return method === "GET";
  if (pathname === AUTH_SESSION_HTTP_PATH) return method === "GET" || method === "DELETE";
  return false;
}

async function executeSessionRoute(
  options: DataApiServerOptions,
  request: IncomingMessage,
  pathname: string,
  requestId: string,
  maxRequestBytes: number,
): Promise<SessionHttpResult> {
  const service = options.sessionHttpService;
  if (service === undefined) return sessionInputError(requestId);
  const method = (request.method ?? "").toUpperCase();
  if (!sessionMethodAllowed(pathname, method)) return sessionMethodError(requestId);
  const token = parseSessionCookie(header(request, "cookie"));
  if (pathname === AUTH_LOGIN_HTTP_PATH) {
    return service.login(await readJson(request, maxRequestBytes), requestId);
  }
  if (pathname === AUTH_WORKSPACE_HTTP_PATH) {
    return service.switchWorkspace(
      token,
      await readJson(request, maxRequestBytes),
      requestId,
    );
  }
  if (pathname === AUTH_SESSION_HTTP_PATH && method === "DELETE") {
    return service.logout(token, requestId);
  }
  return service.current(token, requestId);
}

export function createDataApiServer(options: DataApiServerOptions): Server {
  if (options.internalToken.length < 32) {
    throw new Error("DATA_API_INTERNAL_TOKEN must contain at least 32 characters");
  }
  const maxRequestBytes = positiveInteger(
    options.maxRequestBytes,
    DEFAULT_DATA_API_MAX_REQUEST_BYTES,
  );
  const maxResponseBytes = positiveInteger(
    options.maxResponseBytes,
    DEFAULT_DATA_API_MAX_RESPONSE_BYTES,
  );
  const handler = createDataQueryHttpHandler(options.service);
  const reconcileHandler = createDataQueryHttpHandler(options.service, "admin_reconcile");

  return createServer(async (request, response) => {
    const requestId = resolveRequestId(header(request, REQUEST_ID_HEADER));
    try {
      const url = new URL(request.url ?? "/", "http://data-api.internal");
      if (url.pathname === "/healthz" && request.method === "GET") {
        sendJson(response, 200, { ok: true }, requestId);
        return;
      }
      if (SESSION_HTTP_PATHS.has(url.pathname)) {
        const internalCaller = authenticateInternalCaller(request, options.internalToken);
        if (internalCaller !== "approved") {
          const result = internalCaller === "missing"
            ? {
                status: 401,
                body: sessionErrorResponseSchema.parse({
                  ok: false,
                  error: {
                    code: "UNAUTHORIZED",
                    message: "Authentication is required",
                    retryable: false,
                    requestId,
                  },
                }),
              }
            : {
                status: 403,
                body: sessionErrorResponseSchema.parse({
                  ok: false,
                  error: {
                    code: "FORBIDDEN",
                    message: "Internal caller is not authorized",
                    retryable: false,
                    requestId,
                  },
                }),
              };
          sendJson(response, result.status, result.body, requestId);
          return;
        }
        if ([...url.searchParams].length > 0) {
          const result = sessionInputError(requestId);
          sendJson(response, result.status, result.body, requestId);
          return;
        }
        let result: SessionHttpResult;
        try {
          result = await executeSessionRoute(
            options,
            request,
            url.pathname,
            requestId,
            maxRequestBytes,
          );
        } catch (error) {
          if (error instanceof HttpInputError) throw error;
          result = sessionInternalError(requestId);
        }
        const extraHeaders: Record<string, string> = {};
        if (result.sessionToken !== undefined && result.cookieMaxAgeSeconds !== undefined) {
          extraHeaders["set-cookie"] = sessionCookie(
            result.sessionToken,
            result.cookieMaxAgeSeconds,
          );
        } else if (result.clearCookie === true) {
          extraHeaders["set-cookie"] = clearedSessionCookie();
        }
        const sent = sendBoundedJson(
          response,
          result.status,
          result.body,
          requestId,
          maxResponseBytes,
          () => sessionTruncatedError(requestId).body,
          extraHeaders,
        );
        if (!sent && result.sessionToken !== undefined) {
          try {
            await options.sessionHttpService?.discard(result.sessionToken);
          } catch {
            // The bounded error is already committed; never leak cleanup failures or tokens.
          }
        }
        return;
      }
      const resolvedDetailRoute = detailRoute(url.pathname);
      const isTaskListRoute = url.pathname === TASK_LIST_HTTP_PATH;
      const isAccountListRoute = url.pathname === ACCOUNT_LIST_HTTP_PATH;
      const isWorkItemListRoute = url.pathname === WORK_ITEM_LIST_HTTP_PATH;
      // arch 开的缝：R-014 由 be2 在 src/r014/routes.ts 注册，壳层不认识具体路径，只问一句归不归它。
      const r014Route = findR014Route(url.pathname);
      if (
        url.pathname !== DATA_QUERY_HTTP_PATH &&
        url.pathname !== SEMANTIC_QUERY_HTTP_PATH &&
        url.pathname !== ADMIN_RECONCILE_HTTP_PATH &&
        resolvedDetailRoute === null &&
        !isTaskListRoute &&
        !isAccountListRoute &&
        !isWorkItemListRoute &&
        r014Route === null
      ) {
        sendJson(
          response,
          404,
          errorBody("INVALID_REQUEST", "Route not found", requestId),
          requestId,
        );
        return;
      }
      const authentication = await authenticateBusinessCaller(
        request,
        options.internalToken,
        options.sessionAuthService,
      );
      if (authentication.status === "forbidden") {
        sendJson(
          response,
          403,
          errorBody("FORBIDDEN", "Internal caller is not authorized", requestId),
          requestId,
        );
        return;
      }
      if (authentication.status === "missing") {
        if (isAccountListRoute) {
          const result = await options.accountListService.execute({}, null, requestId);
          sendJson(response, accountListHttpStatus(result), result, requestId);
          return;
        }
        if (isWorkItemListRoute) {
          const result = await options.workItemListService.execute({}, null, requestId);
          sendJson(response, workItemListHttpStatus(result), result, requestId);
          return;
        }
        if (isTaskListRoute) {
          const result = await options.taskListService.execute({}, null, requestId);
          sendJson(response, taskListHttpStatus(result), result, requestId);
          return;
        }
        if (resolvedDetailRoute !== null || r014Route !== null) {
          sendJson(
            response,
            401,
            detailErrorBody("UNAUTHORIZED", "Authentication is required", requestId),
            requestId,
          );
          return;
        }
        const result = await handler({
          method: request.method ?? "",
          body: {},
          auth: null,
          requestId,
        });
        sendJson(response, result.status, result.body, requestId);
        return;
      }
      if (r014Route !== null) {
        await r014Route.handle({
          request, response, url, auth: authentication.auth, requestId, maxResponseBytes,
        });
        return;
      }
      if (isAccountListRoute) {
        if ((request.method ?? "").toUpperCase() !== "GET") {
          sendJson(
            response,
            405,
            accountListErrorBody("INVALID_REQUEST", "Only GET is supported", requestId),
            requestId,
          );
          return;
        }
        const result = await options.accountListService.execute(
          parseAccountListSearch(url.searchParams),
          authentication.auth,
          requestId,
        );
        sendBoundedJson(
          response,
          accountListHttpStatus(result),
          result,
          requestId,
          maxResponseBytes,
          () => accountListErrorBody(
            "SOURCE_TRUNCATED",
            "Account list response reached the configured body limit",
            requestId,
          ),
        );
        return;
      }
      if (isWorkItemListRoute) {
        if ((request.method ?? "").toUpperCase() !== "GET") {
          sendJson(
            response,
            405,
            workItemListErrorBody("INVALID_REQUEST", "Only GET is supported", requestId),
            requestId,
          );
          return;
        }
        const result = await options.workItemListService.execute(
          parseWorkItemListSearch(url.searchParams),
          authentication.auth,
          requestId,
        );
        sendBoundedJson(
          response,
          workItemListHttpStatus(result),
          result,
          requestId,
          maxResponseBytes,
          () => workItemListErrorBody(
            "SOURCE_TRUNCATED",
            "Work item list response reached the configured body limit",
            requestId,
          ),
        );
        return;
      }
      if (isTaskListRoute) {
        if ((request.method ?? "").toUpperCase() !== "GET") {
          sendJson(
            response,
            405,
            taskListErrorBody(
              "INVALID_REQUEST",
              "Only GET is supported",
              requestId,
            ),
            requestId,
          );
          return;
        }
        const result = await options.taskListService.execute(
          parseTaskListSearch(url.searchParams),
          authentication.auth,
          requestId,
        );
        sendBoundedJson(
          response,
          taskListHttpStatus(result),
          result,
          requestId,
          maxResponseBytes,
          () => taskListErrorBody(
            "SOURCE_TRUNCATED",
            "Task list response reached the configured body limit",
            requestId,
          ),
        );
        return;
      }
      if (resolvedDetailRoute !== null) {
        if ((request.method ?? "").toUpperCase() !== "GET") {
          sendJson(
            response,
            405,
            detailErrorBody("INVALID_REQUEST", "Only GET is supported", requestId),
            requestId,
          );
          return;
        }
        const result = resolvedDetailRoute.kind === "work_item"
          ? await options.detailService.getWorkItem(
              resolvedDetailRoute.id,
              authentication.auth,
              requestId,
            )
          : await options.detailService.getChangeSet(
              resolvedDetailRoute.id,
              authentication.auth,
              requestId,
            );
        sendBoundedJson(
          response,
          detailStatus(result),
          result,
          requestId,
          maxResponseBytes,
          () => detailErrorBody(
            "SOURCE_TRUNCATED",
            "Detail response reached the configured body limit",
            requestId,
          ),
        );
        return;
      }
      if ((request.method ?? "").toUpperCase() !== "POST") {
        const result = await handler({
          method: request.method ?? "",
          body: {},
          auth: authentication.auth,
          requestId,
        });
        sendJson(response, result.status, result.body, requestId);
        return;
      }
      if ([...url.searchParams].length > 0) throw new HttpInputError(400, "INVALID_REQUEST");
      let body = await readJson(request, maxRequestBytes);
      if (url.pathname === SEMANTIC_QUERY_HTTP_PATH) {
        const parsed = semanticQueryRequestSchema.safeParse(body);
        if (!parsed.success) throw new HttpInputError(400, "INVALID_REQUEST");
        body = parsed.data;
      }
      const queryHandler = url.pathname === ADMIN_RECONCILE_HTTP_PATH ? reconcileHandler : handler;
      const result = await queryHandler({
        method: request.method ?? "",
        body,
        auth: authentication.auth,
        requestId,
      });
      sendBoundedJson(
        response,
        result.status,
        result.body,
        requestId,
        maxResponseBytes,
        () => errorBody(
            "SOURCE_TRUNCATED",
            "Data response reached the configured body limit",
            requestId,
          ),
      );
    } catch (error) {
      if (error instanceof AccountListHttpInputError) {
        sendJson(
          response,
          400,
          accountListErrorBody("INVALID_REQUEST", "Invalid account list request", requestId),
          requestId,
        );
        return;
      }
      if (error instanceof WorkItemListHttpInputError) {
        sendJson(
          response,
          400,
          workItemListErrorBody(
            "INVALID_REQUEST",
            "Invalid work item list request",
            requestId,
          ),
          requestId,
        );
        return;
      }
      if (error instanceof TaskListHttpInputError) {
        sendJson(
          response,
          400,
          taskListErrorBody(
            "INVALID_REQUEST",
            "Invalid task list request",
            requestId,
          ),
          requestId,
        );
        return;
      }
      if (error instanceof HttpInputError) {
        sendJson(
          response,
          error.status,
          errorBody(error.code, "Invalid HTTP request", requestId),
          requestId,
        );
        return;
      }
      sendJson(
        response,
        500,
        dataQueryResponseSchema.parse({
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "The data API request could not be completed",
            retryable: false,
            requestId,
          },
        }),
        requestId,
      );
    }
  });
}
