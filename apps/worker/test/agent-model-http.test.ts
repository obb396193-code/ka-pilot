import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentModelCatalogError } from "@ka/db";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { AgentModelCatalogService } from "../src/agent/model-catalog-service.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

const token = "synthetic-model-internal-token-long-enough", requestId = "synthetic-model-http";
const auth = personalAuth({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", accounts: [] });
const data = { items: [{ id: "model-a", label: "model-a", provider: "synthetic", default: false, status: "verified" }] };
describe("model catalog production HTTP composition (synthetic auth)", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) { if (!server.listening) continue; server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); } });
  async function start(options: { result?: unknown; failure?: unknown; max?: number; missing?: boolean; context?: typeof auth } = {}) {
    const list = vi.fn(async () => { if (options.failure) throw options.failure; return options.result ?? data; });
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused,
      accountListService: unused, workItemListService: unused, internalToken: token,
      sessionAuthService: approvedSessionAuth(options.context ?? auth), maxResponseBytes: options.max,
      agentModelCatalogService: options.missing ? undefined : new AgentModelCatalogService({ list }),
    } as unknown as DataApiServerOptions);
    servers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test address");
    return { list, call: async (method = "GET", search = "", headers: Record<string, string> = businessHeaders(token)) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/agent/models${search}`, { method, headers: { ...headers, "x-request-id": requestId, "x-ka-workspace-id": "forged" } });
      return { status: response.status, headers: response.headers, body: await response.json() };
    } };
  }
  it("reads canonical real-shape data with server-approved empty scope", async () => {
    const s = await start(), r = await s.call();
    expect(r).toMatchObject({ status: 200, body: { ok: true, data, meta: { requestId } } });
    expect(r.headers.get("cache-control")).toBe("no-store"); expect(s.list).toHaveBeenCalledWith(auth);
  });
  it("allows readonly team catalog, without projected grants", async () => {
    const context = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } } as typeof auth;
    const s = await start({ context }); expect((await s.call()).status).toBe(200); expect(s.list).toHaveBeenCalledWith(context);
  });
  it("requires both credentials before repository", async () => {
    const s = await start();
    for (const headers of [{}, { authorization: `Bearer ${token}` }, { cookie: "ka_session=synthetic-cookie-long-enough-for-test" }])
      expect((await s.call("GET", "", headers)).status).toBe(401);
    expect((await s.call("GET", "", { ...businessHeaders(token), authorization: "Bearer invalid" })).status).toBe(403);
    expect(s.list).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s, preserving GET Allow", async method => {
    const s = await start(), r = await s.call(method); expect(r.status).toBe(405); expect(r.headers.get("allow")).toBe("GET"); expect(s.list).not.toHaveBeenCalled();
  });
  it.each(["?provider=x", "?workspaceId=x", "?dataSource=ka_data"])("rejects browser catalog selection %s", async search => {
    const s = await start(); expect((await s.call("GET", search)).status).toBe(400); expect(s.list).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN", "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_INVALID_RESPONSE"] as const)("safe typed %s", async code => {
    const status = { FORBIDDEN: 403, SOURCE_UNAVAILABLE: 503, SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502 }[code];
    const r = await (await start({ failure: new AgentModelCatalogError(code) })).call();
    expect(r).toMatchObject({ status, body: { ok: false, error: { code, requestId } } });
  });
  it("missing source stays unavailable and invalid/unsafe data fail closed", async () => {
    expect((await (await start({ missing: true })).call()).status).toBe(503);
    const invalid = await (await start({ result: { ...data, secret: "hidden" } })).call(); expect(invalid.status).toBe(502); expect(JSON.stringify(invalid.body)).not.toContain("hidden");
    const failure = await (await start({ failure: new Error("SQL secret") })).call(); expect(failure.status).toBe(500); expect(JSON.stringify(failure.body)).not.toContain("secret");
  });
  it("exact byte cap fails closed, one byte under succeeds", async () => {
    const size = Buffer.byteLength(JSON.stringify({ ok: true, data, meta: { requestId } }));
    expect((await (await start({ max: size + 1 })).call()).status).toBe(200);
    expect(await (await start({ max: size })).call()).toMatchObject({ status: 502, body: { error: { code: "SOURCE_TRUNCATED", requestId } } });
  });
});
