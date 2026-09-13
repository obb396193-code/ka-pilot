import type { Server } from "node:http";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders, personalAuth, teamAuth } from "./business-auth-fixtures.js";
import { createTaskTabRoutes } from "../src/r014/task-tab-routes.js";
import { registerR014Routes } from "../src/r014/routes.js";

const token = "synthetic-deferred-internal-token-long-enough";
const requestId = "synthetic-deferred-request";
const identity = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222" };
const auth = personalAuth({ ...identity, accounts: [] });
const paths = [
  ["POST", "/api/v1/accounts/KUAISHOU/account-1/tests/test-1/stop"],
  ["POST", "/api/v1/rules/rule-1/autonomy/promote"],
  ["POST", "/api/v1/materials/material-1/replicate"],
  ["POST", "/api/v1/materials/deliveries"],
  ["PUT", "/api/v1/reports/ai-impact/estimates"],
  ["POST", "/api/v1/reports/monthly-exec/decisions"],
  ["POST", "/api/v1/search/actions"],
] as const;

describe("P192 deferred commands production HTTP registration", () => {
  const servers: Server[] = [];
  afterEach(async () => { registerR014Routes([]); for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
  async function start(context = auth) {
    const effect = vi.fn(() => { throw new Error("No business effects permitted"); });
    const unused = new Proxy({}, { get: () => effect });
    registerR014Routes(createTaskTabRoutes(unused as Pool));
    const server = createDataApiServer({ internalToken: token, sessionAuthService: approvedSessionAuth(context),
      service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
    } as unknown as DataApiServerOptions);
    servers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
    return { effect, call: async (method: string, path: string, headers = businessHeaders(token)) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method,
        headers: { ...headers, "x-request-id": requestId, "content-type": "application/json" },
        ...(["POST", "PUT"].includes(method) ? { body: '{"execute":true,"secret":"do-not-echo"}' } : {}),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    } };
  }
  it.each(paths)("%s %s returns correlated 501 with no business service", async (method, path) => {
    const s = await start(), result = await s.call(method, path);
    expect(result.status).toBe(501);
    expect(result.body).toEqual({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "This capability is not part of the first release", retryable: false, requestId } });
    expect(result.headers.get("x-request-id")).toBe(requestId);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(s.effect).not.toHaveBeenCalled();
  });
  it.each(paths)("auth/viewer protections remain before %s %s", async (method, path) => {
    const s = await start();
    for (const headers of [{}, { authorization: `Bearer ${token}` }, { cookie: businessHeaders(token).cookie! }])
      expect((await s.call(method, path, headers)).status).toBe(401);
    expect((await s.call(method, path, { ...businessHeaders(token), authorization: "Bearer wrong" })).status).toBe(403);
    const viewer = await start({ ...auth, role: "viewer" });
    expect(await viewer.call(method, path)).toMatchObject({ status: 403, body: { error: { code: "READ_ONLY_ROLE" } } });
    expect(s.effect).not.toHaveBeenCalled(); expect(viewer.effect).not.toHaveBeenCalled();
  });
  it.each(paths)("wrong methods and query cannot execute %s %s", async (method, path) => {
    const s = await start();
    for (const wrong of ["GET", "DELETE", "PATCH", "OPTIONS", method === "POST" ? "PUT" : "POST"]) {
      const result = await s.call(wrong, path); expect(result.status).toBe(405); expect(result.headers.get("allow")).toBe(method);
    }
    expect((await s.call(method, `${path}?workspaceId=foreign`)).status).toBe(400);
    expect(s.effect).not.toHaveBeenCalled();
  });
  it("team remains non-executing; existing review stays 501; P199 paths are not stubbed", async () => {
    const s = await start(teamAuth(identity));
    for (const [method, path] of paths) expect((await s.call(method, path)).status).toBe(501);
    expect((await s.call("POST", "/api/v1/tasks/task-1/review")).status).toBe(501);
    for (const [method, path] of [["POST", "/api/v1/integrations/subscriptions/1/test-send"], ["PUT", "/api/v1/integrations/on-call"]])
      expect((await s.call(method!, path!)).status).not.toBe(501);
    expect(s.effect).not.toHaveBeenCalled();
  });
});
