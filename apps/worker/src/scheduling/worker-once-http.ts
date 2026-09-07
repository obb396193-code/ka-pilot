import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { resolveRequestId } from "../data/request-id.js";
import { parseWorkerOnceConfig } from "./worker-once.js";
import { workerOnceResponseSchema } from "./worker-once-protocol.js";

const tokenSchema = z.string().min(32).max(512).regex(/^[A-Za-z0-9._~-]+$/);
export function parseWorkerOnceHttpConfig(env: Readonly<NodeJS.ProcessEnv>) {
  const worker = parseWorkerOnceConfig(env);
  return { worker, token: tokenSchema.parse(env.WORKER_TRIGGER_TOKEN),
    host: z.enum(["127.0.0.1", "0.0.0.0", "::1"]).default("127.0.0.1").parse(env.WORKER_HTTP_HOST),
    port: z.coerce.number().int().min(1).max(65535).default(3102).parse(env.WORKER_HTTP_PORT) };
}
export type WorkerOnceHttpConfig = ReturnType<typeof parseWorkerOnceHttpConfig>;
export interface WorkerOnceHttpOptions {
  token: string;
  run(signal: AbortSignal): Promise<unknown>;
  acquireLock(controller: AbortController): Promise<(() => Promise<void>) | null>;
  signal?: AbortSignal;
}
function header(request: IncomingMessage, name: string): string | null {
  let count = 0;
  for (let i = 0; i < request.rawHeaders.length; i += 2) if (request.rawHeaders[i]?.toLowerCase() === name) count++;
  const value = request.headers[name];
  return count === 1 && typeof value === "string" ? value : null;
}
function send(response: ServerResponse, status: number, body: unknown, requestId: string): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId });
  response.end(JSON.stringify(body));
}
async function emptyBody(request: IncomingMessage): Promise<boolean> {
  let bytes = 0; const chunks: Buffer[] = [];
  // Never buffer an unbounded body, nor hold a worker slot while reading one.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes >= 1024) { request.resume(); return false; }
    chunks.push(buffer);
  }
  if (bytes === 0) return true;
  try { return z.object({}).strict().safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).success; }
  catch { return false; }
}

/** Internal deployment trigger only: no Session or browser-supplied source/scope. */
export function createWorkerOnceHttpServer(options: WorkerOnceHttpOptions) {
  const digest = createHash("sha256").update(tokenSchema.parse(options.token)).digest();
  let busy = false;
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 }, (request, response) => {
    const requestId = resolveRequestId(header(request, "x-request-id"));
    const fail = (status: number, code: string, message: string): void => {
      request.resume(); send(response, status, { ok: false, error: { code, message, retryable: status === 409 || status >= 500, requestId } }, requestId);
    };
    void (async () => {
      if (request.url === "/health" && request.method === "GET") { send(response, 200, { ok: true }, requestId); return; }
      if (request.url?.split("?")[0] !== "/internal/worker/once") { fail(404, "NOT_FOUND", "Route not found"); return; }
      const supplied = header(request, "x-worker-trigger-token");
      if (supplied === null || !timingSafeEqual(digest, createHash("sha256").update(supplied).digest())) {
        fail(401, "UNAUTHORIZED", "Authentication is required"); return;
      }
      if (request.method !== "POST") { response.setHeader("allow", "POST"); fail(405, "INVALID_REQUEST", "Method is not allowed"); return; }
      if (request.url !== "/internal/worker/once") { fail(400, "INVALID_REQUEST", "Trigger takes no parameters"); return; }
      if (options.signal?.aborted) { fail(503, "SOURCE_UNAVAILABLE", "Worker is stopping"); return; }
      if (busy) { fail(409, "WORKER_BUSY", "A worker round is already running"); return; }
      if (!await emptyBody(request)) { fail(400, "INVALID_REQUEST", "Trigger takes no parameters"); return; }
      if (busy) { fail(409, "WORKER_BUSY", "A worker round is already running"); return; }
      busy = true;
      const controller = new AbortController(), abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) controller.abort();
      let release: (() => Promise<void>) | null = null;
      let result: unknown;
      try {
        release = await options.acquireLock(controller);
        if (!release) { fail(409, "WORKER_BUSY", "A worker round is already running"); return; }
        if (controller.signal.aborted) { fail(503, "SOURCE_UNAVAILABLE", "Worker is stopping"); return; }
        result = await options.run(controller.signal);
      } finally {
        // The runner guarantees termination before settling; do not unlock on client disconnect.
        try { await release?.(); }
        finally { busy = false; options.signal?.removeEventListener("abort", abort); }
      }
      if (controller.signal.aborted) { fail(503, "SOURCE_UNAVAILABLE", "Worker round was interrupted"); return; }
      const parsed = workerOnceResponseSchema.safeParse(result);
      if (!parsed.success) { fail(502, "UPSTREAM_INVALID_RESPONSE", "Invalid worker result"); return; }
      send(response, 200, parsed.data, requestId);
    })().catch(() => fail(500, "INTERNAL_ERROR", "Worker round failed"));
  });
  return server;
}
