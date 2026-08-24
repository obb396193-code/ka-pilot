import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  dataQueryResponseSchema,
  readDetailResponseSchema,
  type DataQueryResponse,
  type ReadDetailResponse,
} from "@ka/domain";
import { z } from "zod";

import {
  createDataQueryHttpHandler,
  DATA_QUERY_HTTP_PATH,
  type AuthenticatedDataQueryContext,
  type DataQueryService,
} from "./query-service.js";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id.js";
import type { ReadDetailService } from "./read-detail-service.js";

export const DEFAULT_DATA_API_MAX_REQUEST_BYTES = 1024 * 1024;
export const DEFAULT_DATA_API_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

const accountScopeSchema = z.array(z.object({
  media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  accountId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict()).max(1_000);

export interface DataApiServerOptions {
  service: DataQueryService;
  detailService: ReadDetailService;
  internalToken: string;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
}

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

function authenticate(
  request: IncomingMessage,
  internalToken: string,
): { auth: AuthenticatedDataQueryContext | null; forbidden: boolean } {
  const authorization = header(request, "authorization");
  if (authorization === null) return { auth: null, forbidden: false };
  const expected = `Bearer ${internalToken}`;
  if (!constantTimeTokenEquals(authorization, expected)) {
    return { auth: null, forbidden: true };
  }
  const workspaceId = header(request, "x-ka-workspace-id");
  const userId = header(request, "x-ka-user-id");
  const encodedScope = header(request, "x-ka-account-scope");
  if (workspaceId === null || userId === null || encodedScope === null) {
    return { auth: null, forbidden: true };
  }
  try {
    const decoded = Buffer.from(encodedScope, "base64url").toString("utf8");
    const allowedAccounts = accountScopeSchema.parse(JSON.parse(decoded) as unknown);
    if (workspaceId.trim() === "" || userId.trim() === "") {
      return { auth: null, forbidden: true };
    }
    return { auth: { workspaceId, userId, allowedAccounts }, forbidden: false };
  } catch {
    return { auth: null, forbidden: true };
  }
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
  code: "INVALID_REQUEST" | "FORBIDDEN" | "SOURCE_TRUNCATED",
  message: string,
  requestId: string,
): DataQueryResponse {
  return dataQueryResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId },
  });
}

function detailErrorBody(
  code: "INVALID_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "INTERNAL_ERROR",
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
  if (result.error.code === "INVALID_REQUEST") return 400;
  return 500;
}

function sendJson(
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

  return createServer(async (request, response) => {
    const requestId = resolveRequestId(header(request, REQUEST_ID_HEADER));
    try {
      const url = new URL(request.url ?? "/", "http://data-api.internal");
      if (url.pathname === "/healthz" && request.method === "GET") {
        sendJson(response, 200, { ok: true }, requestId);
        return;
      }
      const resolvedDetailRoute = detailRoute(url.pathname);
      if (url.pathname !== DATA_QUERY_HTTP_PATH && resolvedDetailRoute === null) {
        sendJson(
          response,
          404,
          errorBody("INVALID_REQUEST", "Route not found", requestId),
          requestId,
        );
        return;
      }
      const authentication = authenticate(request, options.internalToken);
      if (authentication.forbidden) {
        sendJson(
          response,
          403,
          errorBody("FORBIDDEN", "Internal caller is not authorized", requestId),
          requestId,
        );
        return;
      }
      if (authentication.auth === null) {
        if (resolvedDetailRoute !== null) {
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
        sendJson(response, detailStatus(result), result, requestId);
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
      const body = await readJson(request, maxRequestBytes);
      const result = await handler({
        method: request.method ?? "",
        body,
        auth: authentication.auth,
        requestId,
      });
      const serialized = JSON.stringify(result.body);
      if (Buffer.byteLength(serialized) > maxResponseBytes) {
        sendJson(
          response,
          502,
          errorBody(
            "SOURCE_TRUNCATED",
            "Data response exceeded the configured body limit",
            requestId,
          ),
          requestId,
        );
        return;
      }
      sendJson(response, result.status, result.body, requestId);
    } catch (error) {
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
