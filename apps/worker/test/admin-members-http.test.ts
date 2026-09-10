import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminMembersError, AdminMemberProvisioningError } from "@ka/db";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { AdminMembersService } from "../src/admin/members-service.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";
const token = "synthetic-member-internal-token-long-enough", requestId = "synthetic-member-http";
const auth = personalAuth({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", accounts: [] });
const id = "33333333-3333-4333-8333-333333333333";
describe("admin member HTTP boundary", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise<void>((resolve, reject) => s.close(e => e ? reject(e) : resolve())); } });
  async function start(options: { result?: unknown; failure?: unknown; max?: number; missing?: boolean; context?: typeof auth } = {}) {
    const read = vi.fn(async (_auth: unknown, identityId?: string) => { if (options.failure) throw options.failure; return options.result ?? { workspaceId: auth.workspaceId, data: identityId ? { identityId, items: [] } : { items: [] } }; });
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    const provisioning = { read: async (context: typeof auth) => {
      // This test double models a DB denial. Local role is NOT a service authorization rule.
      if (context.role !== "admin") { await read(context); throw new AdminMemberProvisioningError("FORBIDDEN"); }
      const value = await read(context); return options.result === undefined ? { items: [] } : value;
    }, create: vi.fn(), resetPassword: vi.fn() };
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken: token, sessionAuthService: approvedSessionAuth(options.context ?? auth), maxResponseBytes: options.max,
      adminMembersService: options.missing ? undefined : new AdminMembersService({ read }, () => new Date("2026-09-08T01:00:00Z"), provisioning),
    } as unknown as DataApiServerOptions); servers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
    return { read, call: async (suffix = "", method = "GET", headers: Record<string, string> = businessHeaders(token)) => {
      const r = await fetch(`http://127.0.0.1:${address.port}/api/v1/admin/members${suffix}`, { method, headers: { ...headers, "x-request-id": requestId, "x-ka-role": "admin" } });
      return { status: r.status, headers: r.headers, body: await r.json() };
    } };
  }
  it.each(["", `/${id}/grants`])("serves canonical empty %s and no-store", async path => { const s = await start(), r = await s.call(path); expect(r.status).toBe(200); expect(r.body.data.items).toEqual([]); expect(r.body.meta).toMatchObject({ requestId, dataAsOf: null, workspaceKind: "personal" }); expect(r.headers.get("cache-control")).toBe("no-store"); });
  it.each(["optimizer", "operator", "lead"] as const)("passes %s to global DB authorization but keeps local grants gate", async role => { const s = await start({ context: { ...auth, role } }); expect((await s.call()).status).toBe(403); expect((await s.call(`/${id}/grants`)).status).toBe(403); expect(s.read).toHaveBeenCalledTimes(1); });
  it.each(["PATCH", "PUT", "DELETE"])("blocks %s on both routes", async method => { const s = await start(); for (const p of ["", `/${id}/grants`]) { const r = await s.call(p, method); expect(r.status).toBe(405); expect(r.headers.get("allow")).toBe(p ? "GET" : "GET, POST"); } expect(s.read).not.toHaveBeenCalled(); });
  it("grants POST is still unavailable", async () => { const s = await start(); expect((await s.call(`/${id}/grants`, "POST")).status).toBe(405); expect(s.read).not.toHaveBeenCalled(); });
  it("rejects invalid query/path and missing auth before repository", async () => {
    const s = await start(); for (const p of ["?workspaceId=other", "/bad/grants", `/${id}/grants?role=admin`]) expect((await s.call(p)).status).toBe(400);
    expect((await s.call("", "GET", {})).status).toBe(401); expect((await s.call(`/${id}/grants`, "GET", { authorization: `Bearer ${token}` })).status).toBe(401); expect(s.read).not.toHaveBeenCalled();
  });
  it.each([["NOT_FOUND", 404], ["UPSTREAM_INVALID_RESPONSE", 502], ["SOURCE_TRUNCATED", 502], ["SOURCE_UNAVAILABLE", 503], ["UPSTREAM_TIMEOUT", 504]] as const)("maps typed %s safely", async (code, status) => { expect(await (await start({ failure: new AdminMembersError(code) })).call()).toMatchObject({ status, body: { error: { code, requestId } } }); });
  it("guards workspace/target/team output and does not reflect raw errors", async () => {
    for (const result of [{ workspaceId: "foreign", data: { items: [] } }, { workspaceId: auth.workspaceId, data: { items: [], secret: "hidden" } }]) expect((await (await start({ result })).call()).status).toBe(502);
    expect((await (await start({ result: { workspaceId: auth.workspaceId, data: { identityId: auth.userId, items: [] } } })).call(`/${id}/grants`)).status).toBe(502);
    const team = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } } as typeof auth;
    const result = { workspaceId: auth.workspaceId, data: { identityId: id, items: [{ media: "KUAISHOU", accountId: "same", accessLevel: "execute", grantedAt: "2026-09-08" }] } };
    expect((await (await start({ result, context: team })).call(`/${id}/grants`)).status).toBe(502);
    expect((await (await start({ missing: true })).call()).status).toBe(503);
    const bad = await (await start({ failure: new Error("secret SQL") })).call(); expect(bad.status).toBe(500); expect(JSON.stringify(bad.body)).not.toContain("secret");
  });
  it.each(["", `/${id}/grants`])("applies exact byte limit to %s", async p => {
    const data = p ? { identityId: id, items: [] } : { items: [] };
    const size = Buffer.byteLength(JSON.stringify({ ok: true, data, meta: { requestId, dataAsOf: null, businessDate: "2026-09-08", workspaceKind: "personal", selectedSource: "platform" } }));
    expect((await (await start({ max: size + 1 })).call(p)).status).toBe(200); expect((await (await start({ max: size })).call(p)).status).toBe(502);
  });
});
