import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataApiServer, type DataApiServerOptions } from "../../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders, teamAuth } from "../business-auth-fixtures.js";
import { filesUnder, importedHttpPaths, inventory } from "./route-path-inventory.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url)), shell = resolve(root, "apps/worker/src/data/http-server.ts");
const allPaths = [...new Set([...inventory([...filesUnder(resolve(root, "apps/worker/src/r010")), shell]).paths, ...importedHttpPaths(shell)])];
const sessionPaths = new Set(["/api/v1/auth/login", "/api/v1/auth/session", "/api/v1/auth/workspace", "/api/v1/auth/workspaces"]);
// These POSTs query data, not mutate it. Administrator diagnostics retain their own independent entitlement check.
const readPosts = new Set(["/api/v1/data/query", "/api/v1/query", "/api/v1/admin/data/reconcile"]);
const writes = allPaths.filter(path => !sessionPaths.has(path)).flatMap(path => ["POST", "PUT", "PATCH", "DELETE"]
  .filter(method => method !== "POST" || !readPosts.has(path)).map(method => [method, path] as const));
const token = "synthetic-viewer-business-internal-token-long-enough";
const context = { ...teamAuth({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222" }), role: "viewer" as const };

describe("P191 viewer write boundary / actual Data API HTTP", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } });
  async function start(role = "viewer") {
    const called = vi.fn(() => { throw new Error("Business service must not run before the viewer gate"); });
    const unused = new Proxy({}, { get: () => called });
    const logout = vi.fn(async () => ({ status: 200, body: { ok: true, data: { loggedOut: true }, meta: { requestId: "viewer-test" } }, clearCookie: true }));
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused,
      workItemListService: unused, internalToken: token, sessionAuthService: approvedSessionAuth({ ...context, role } as typeof context),
      sessionHttpService: { logout }, maxRequestBytes: 32,
    } as unknown as DataApiServerOptions);
    servers.push(server); await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
    return { called, logout, call: async (method: string, path: string, headers = businessHeaders(token), body?: string) => {
      const response = await fetch(`http://127.0.0.1:${address.port}${path.replaceAll(":p", context.userId)}`, { method,
        headers: { ...headers, "x-request-id": "viewer-test", "x-ka-role": "admin", "content-type": "application/json" }, ...(body === undefined ? {} : { body }) });
      const result = await response.json(); expect(response.headers.get("x-request-id")).toBe("viewer-test");
      expect(response.headers.get("cache-control")).toBe("no-store");
      return { status: response.status, body: result };
    } };
  }
  it("enumerates actual route inventory, not an empty or manually maintained subset", () => {
    expect(allPaths.length).toBeGreaterThanOrEqual(20); expect(writes.length).toBeGreaterThanOrEqual(61);
    expect(writes).toContainEqual(["POST", "/api/v1/changesets/:p/dry-run"]);
    expect(writes).toContainEqual(["DELETE", "/api/v1/admin/members/:p/grants"]);
  });
  it.each(writes)("viewer %s %s stops before any business handler", async (method, path) => {
    const state = await start(), result = await state.call(method, path);
    expect(result).toEqual({ status: 403, body: { ok: false, error: { code: "READ_ONLY_ROLE", message: "This role is read-only", retryable: false, requestId: "viewer-test" } } });
    expect(state.called).not.toHaveBeenCalled();
  });
  it("does not parse even oversized invalid mutation bodies before role rejection", async () => {
    const state = await start();
    expect((await state.call("POST", "/api/v1/changesets/:p/dry-run", businessHeaders(token), "x".repeat(4096))).body.error.code).toBe("READ_ONLY_ROLE");
    expect(state.called).not.toHaveBeenCalled();
  });
  it("leaves GET and read-query POST routing intact", async () => {
    const state = await start();
    expect((await state.call("GET", "/api/v1/agent/models")).body.error.code).toBe("SOURCE_UNAVAILABLE");
    for (const path of readPosts) expect((await state.call("POST", path, businessHeaders(token), "{}")).body.error.code).not.toBe("READ_ONLY_ROLE");
  });
  it("lets viewers log out, and does not change non-viewer or unauthenticated behavior", async () => {
    const state = await start(); expect((await state.call("DELETE", "/api/v1/auth/session")).status).toBe(200); expect(state.logout).toHaveBeenCalledOnce();
    expect((await state.call("POST", "/api/v1/changesets/:p/dry-run", {})).status).toBe(401);
    // F-OS-004 now registers POST. An unconfigured dependency is 503, not viewer403 or the old405.
    const admin = await start("admin"); expect((await admin.call("POST", "/api/v1/admin/members")).status).toBe(503);
  });
});
