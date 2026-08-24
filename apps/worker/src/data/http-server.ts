import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { dataQueryResponseSchema, type DataQueryResponse } from "@ka/domain";
import { z } from "zod";

import {
  createDataQueryHttpHandler,
  DATA_QUERY_HTTP_PATH,
  type AuthenticatedDataQueryContext,
  type DataQueryService,
} from "./query-service.js";

export const DEFAULT_DATA_API_MAX_REQUEST_BYTES = 1024 * 1024;
export const DEFAULT_DATA_API_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

const accountScopeSchema = z.array(z.object({
  media: z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/),
  accountId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict()).max(1_000);

export interface DataApiServerOptions {
  service: DataQueryService;
  internalToken: string;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
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
): DataQueryResponse {
  return dataQueryResponseSchema.parse({
    ok: false,
    error: { code, message, retryable: false, requestId: randomUUID() },
  });
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
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
    try {
      const url = new URL(request.url ?? "/", "http://data-api.internal");
      if (url.pathname === "/healthz" && request.method === "GET") {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (url.pathname !== DATA_QUERY_HTTP_PATH) {
        sendJson(response, 404, errorBody("INVALID_REQUEST", "Route not found"));
        return;
      }
      const authentication = authenticate(request, options.internalToken);
      if (authentication.forbidden) {
        sendJson(response, 403, errorBody("FORBIDDEN", "Internal caller is not authorized"));
        return;
      }
      if (authentication.auth === null) {
        const result = await handler({ method: request.method ?? "", body: {}, auth: null });
        sendJson(response, result.status, result.body);
        return;
      }
      if ((request.method ?? "").toUpperCase() !== "POST") {
        const result = await handler({
          method: request.method ?? "",
          body: {},
          auth: authentication.auth,
        });
        sendJson(response, result.status, result.body);
        return;
      }
      const body = await readJson(request, maxRequestBytes);
      const result = await handler({
        method: request.method ?? "",
        body,
        auth: authentication.auth,
      });
      const serialized = JSON.stringify(result.body);
      if (Buffer.byteLength(serialized) > maxResponseBytes) {
        sendJson(
          response,
          502,
          errorBody("SOURCE_TRUNCATED", "Data response exceeded the configured body limit"),
        );
        return;
      }
      sendJson(response, result.status, result.body);
    } catch (error) {
      if (error instanceof HttpInputError) {
        sendJson(response, error.status, errorBody(error.code, "Invalid HTTP request"));
        return;
      }
      sendJson(response, 500, dataQueryResponseSchema.parse({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "The data API request could not be completed",
          retryable: false,
          requestId: randomUUID(),
        },
      }));
    }
  });
}
