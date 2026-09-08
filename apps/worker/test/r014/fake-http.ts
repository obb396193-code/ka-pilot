import { EventEmitter } from "node:events";

import { findR014Route } from "../../src/r014/routes.js";

/** 最小的 req/res 替身：只验路由层自己的行为，不把整个壳层拖进来。 */
export interface Captured { status: number; headers: Record<string, string>; body: unknown }

export function fakeRequest(method: string, body?: unknown): never {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Object.assign(new EventEmitter(), {
    method,
    [Symbol.asyncIterator]: async function* (): AsyncGenerator<Buffer> { yield* payload; },
  });
  return request as never;
}

export function fakeResponse(): { response: never; captured: () => Captured } {
  let status = 0;
  let headers: Record<string, string> = {};
  let raw = "";
  const response = {
    writeHead(code: number, given: Record<string, string> = {}) { status = code; headers = given; return response; },
    end(chunk?: string) { raw = chunk ?? ""; },
  };
  return {
    response: response as never,
    captured: () => ({ status, headers, body: raw === "" ? undefined : JSON.parse(raw) as unknown }),
  };
}

export async function callRoute(
  auth: unknown,
  pathname: string,
  method: string,
  body?: unknown,
  search = "",
): Promise<Captured> {
  const route = findR014Route(pathname);
  if (route === null) throw new Error(`no R-014 route matched ${pathname}`);
  const { response, captured } = fakeResponse();
  await route.handle({
    request: fakeRequest(method, body),
    response,
    url: new URL(`http://data-api.internal${pathname}${search}`),
    auth: auth as never,
    requestId: "test-request",
    maxResponseBytes: 1_000_000,
  });
  return captured();
}
