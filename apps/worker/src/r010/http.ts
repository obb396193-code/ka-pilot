import type { IncomingMessage, ServerResponse } from "node:http";

export type R010ErrorCode = "INVALID_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATE"
  | "SOURCE_UNAVAILABLE" | "UPSTREAM_INVALID_RESPONSE" | "SOURCE_TRUNCATED" | "INTERNAL_ERROR";
const messages: Record<R010ErrorCode, string> = {
  INVALID_REQUEST: "The request is not valid", FORBIDDEN: "Access is not allowed",
  NOT_FOUND: "The resource does not exist", INVALID_STATE: "The resource is in a conflicting state",
  SOURCE_UNAVAILABLE: "The requested operation is not available",
  UPSTREAM_INVALID_RESPONSE: "The service returned an invalid response",
  SOURCE_TRUNCATED: "Response reaches the configured limit", INTERNAL_ERROR: "The request could not be completed",
};
export class R010HttpError extends Error {
  constructor(readonly status: number, readonly code: R010ErrorCode) { super(code); }
}
export function byteLimit(value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value <= 0) throw new R010HttpError(500, "INTERNAL_ERROR");
  return Math.min(value, maximum);
}
function sendJson(response: ServerResponse, status: number, value: unknown, requestId: string, allow = "POST"): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body),
    "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId,
    ...(status === 405 ? { allow } : {}), ...(status === 413 ? { connection: "close" } : {}),
  });
  response.end(body);
}
export function sendFailure(response: ServerResponse, status: number, code: R010ErrorCode, requestId: string, allow = "POST"): void {
  sendJson(response, status, { ok: false, error: { code, message: messages[code], retryable: false, requestId } }, requestId, allow);
}
export function sendData(response: ServerResponse, data: unknown, requestId: string, maxBytes: number): void {
  const body = { ok: true, data, meta: { requestId } };
  if (Buffer.byteLength(JSON.stringify(body)) >= maxBytes) throw new R010HttpError(502, "SOURCE_TRUNCATED");
  sendJson(response, 200, body, requestId);
}

/** Reject before the command, drain rather than destroying IncomingMessage's
 * socket so the client can receive a stable 413. The HTTP shell owns timeouts.
 */
export function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    function cleanup(): void {
      request.off("data", onData); request.off("end", onEnd);
      request.off("error", onError); request.off("aborted", onError);
    }
    function fail(status: number): void {
      cleanup();
      // A socket can report an error after the limit/abort event. Do not leave
      // the draining request with an unhandled error listener gap.
      request.once("error", () => undefined);
      request.resume(); reject(new R010HttpError(status, "INVALID_REQUEST"));
    }
    function onData(chunk: Buffer | string): void {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += data.byteLength;
      if (size > maxBytes) { fail(413); return; }
      chunks.push(data);
    }
    function onEnd(): void {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown); }
      catch { reject(new R010HttpError(400, "INVALID_REQUEST")); }
    }
    function onError(): void { fail(400); }
    if (request.destroyed || request.readableEnded) { reject(new R010HttpError(400, "INVALID_REQUEST")); return; }
    request.on("data", onData); request.once("end", onEnd);
    request.once("error", onError); request.once("aborted", onError);
  });
}
