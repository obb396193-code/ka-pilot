import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminMemberProvisioningError } from "@ka/db";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { AdminMembersService } from "../src/admin/members-service.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";
const token = "synthetic-member-internal-token-long-enough", requestId = "synthetic-member-http";
const auth = personalAuth({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", accounts: [] });
const id = "33333333-3333-4333-8333-333333333333";
/** 目标身份自己的个人空间——v1.9.46 ① 起授权读写都落在这里，不是调用方当前空间。 */
const targetWorkspace = "44444444-4444-4444-8444-444444444444";
const member = { identityId: id, userId: "55555555-5555-4555-8555-555555555555", displayName: "synthetic", provider: "internal_test",
  role: "lead", isActive: true, joinedAt: "2026-09-01", grantsCount: 1, lastSeenAt: null, mustChangePassword: false };
const grant = { media: "KUAISHOU", accountId: "same", accessLevel: "execute", grantedAt: "2026-09-08" };
const grantInput = { media: grant.media, accountId: grant.accountId, accessLevel: grant.accessLevel };
type Port = "list" | "grants" | "patch" | "replaceGrants";

describe("admin member HTTP boundary (v1.9.46 identity governance)", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise<void>((resolve, reject) => s.close(e => e ? reject(e) : resolve())); } });
  async function start(options: { failure?: unknown; max?: number; missing?: boolean; context?: typeof auth; results?: Partial<Record<Port, unknown>> } = {}) {
    const answer = (value: unknown) => vi.fn(async (...args: unknown[]) => { void args; if (options.failure) throw options.failure; return value; });
    const provisioning = { read: answer(options.results?.list ?? { items: [] }), create: vi.fn(), resetPassword: vi.fn() };
    const management = {
      grants: answer(options.results?.grants ?? { workspaceId: targetWorkspace, data: { identityId: id, items: [grant] } }),
      patch: answer(options.results?.patch ?? { workspaceId: targetWorkspace, data: member }),
      replaceGrants: answer(options.results?.replaceGrants ?? { workspaceId: targetWorkspace, data: { identityId: id, items: [grant] } }),
    };
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken: token, sessionAuthService: approvedSessionAuth(options.context ?? auth), maxResponseBytes: options.max,
      adminMembersService: options.missing ? undefined : new AdminMembersService(() => new Date("2026-09-08T01:00:00Z"), provisioning, management),
    } as unknown as DataApiServerOptions); servers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
    const called = () => [provisioning.read, management.grants, management.patch, management.replaceGrants].some(fn => fn.mock.calls.length > 0);
    return { provisioning, management, called, call: async (suffix = "", method = "GET", body?: unknown, headers: Record<string, string> = businessHeaders(token)) => {
      const r = await fetch(`http://127.0.0.1:${address.port}/api/v1/admin/members${suffix}`, { method,
        headers: { ...headers, "x-request-id": requestId, "x-ka-role": "admin", ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
      return { status: r.status, headers: r.headers, body: await r.json() };
    } };
  }

  it("serves the global list and the target identity's grants with canonical meta and no-store", async () => {
    const s = await start();
    const list = await s.call(); expect(list.status).toBe(200); expect(list.body.data.items).toEqual([]);
    const grants = await s.call(`/${id}/grants`);
    expect(grants.status).toBe(200); expect(grants.body.data).toEqual({ identityId: id, items: [grant] });
    expect(grants.body.meta).toMatchObject({ requestId, dataAsOf: null, workspaceKind: "personal" }); expect(grants.headers.get("cache-control")).toBe("no-store");
    // 结果落在目标身份自己的个人空间（≠ 调用方当前空间）是 v1.9.46 的本意，不是越界。
    expect(s.management.grants).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: auth.workspaceId }), id);
  });
  it.each(["optimizer", "operator", "lead"] as const)("does not let the local %s session role decide governance; the repository does", async role => {
    const allowed = await start({ context: { ...auth, role } });
    expect((await allowed.call(`/${id}/grants`)).status).toBe(200); expect(allowed.management.grants).toHaveBeenCalledTimes(1);
    const denied = await start({ context: { ...auth, role }, failure: new AdminMemberProvisioningError("FORBIDDEN") });
    expect((await denied.call(`/${id}/grants`)).status).toBe(403);
  });
  it("read-only viewers never reach any port", async () => {
    const s = await start({ context: { ...auth, role: "viewer" } as typeof auth });
    for (const [path, method, body] of [["", "GET"], [`/${id}/grants`, "GET"], [`/${id}`, "PATCH", { role: "lead" }], [`/${id}/grants`, "PUT", { items: [] }]] as const) {
      expect((await s.call(path, method, body)).status).toBe(403);
    }
    expect(s.called()).toBe(false);
  });
  it("PATCH changes role or deactivates, and returns the updated row", async () => {
    const s = await start(), r = await s.call(`/${id}`, "PATCH", { role: "lead" });
    expect(r).toMatchObject({ status: 200, body: { ok: true, data: member } });
    expect(s.management.patch).toHaveBeenCalledWith(expect.anything(), id, { role: "lead" });
    // 请求停用、读回来却还是启用：说明没改到，不能回 200。
    expect((await s.call(`/${id}`, "PATCH", { is_active: false })).status).toBe(502);
    expect((await (await start({ results: { patch: { workspaceId: targetWorkspace, data: { ...member, role: "optimizer" } } } })).call(`/${id}`, "PATCH", { role: "lead" })).status).toBe(502);
  });
  it("PUT replaces grants and refuses a read-back that differs from the request", async () => {
    const s = await start(), r = await s.call(`/${id}/grants`, "PUT", { items: [grantInput] });
    expect(r).toMatchObject({ status: 200, body: { data: { identityId: id, items: [grant] } } });
    expect(s.management.replaceGrants).toHaveBeenCalledWith(expect.anything(), id, { items: [grantInput] });
    expect((await s.call(`/${id}/grants`, "PUT", { items: [] })).status).toBe(502);
    expect((await s.call(`/${id}/grants`, "PUT", { items: [{ ...grantInput, accessLevel: "read" }] })).status).toBe(502);
  });
  it("rejects invalid bodies, paths, queries and methods before any port", async () => {
    const s = await start();
    for (const [path, method, body] of [
      [`/${id}`, "PATCH", {}], [`/${id}`, "PATCH", { role: "owner" }], [`/${id}`, "PATCH", { is_active: "no" }], [`/${id}`, "PATCH", "not json"],
      [`/${id}`, "PATCH", { role: "lead", workspaceId: "other" }],
      [`/${id}/grants`, "PUT", { items: [grantInput, grantInput] }], [`/${id}/grants`, "PUT", { items: [grant] }],
      ["/bad", "PATCH", { role: "lead" }], ["/bad/grants", "GET"], [`/${id}/grants?workspaceId=other`, "GET"], ["?role=admin", "GET"],
    ] as const) expect((await s.call(path, method, body)).status, `${method} ${path}`).toBe(400);
    for (const [path, method, allow] of [[`/${id}`, "DELETE", "PATCH"], [`/${id}/grants`, "POST", "GET, PUT"], ["", "PATCH", "GET, POST"], [`/${id}/reset-password`, "PUT", "POST"]] as const) {
      const r = await s.call(path, method, method === "DELETE" ? undefined : {}); expect(r.status).toBe(405); expect(r.headers.get("allow")).toBe(allow);
    }
    expect((await s.call("", "GET", undefined, {})).status).toBe(401);
    expect((await s.call(`/${id}/grants`, "GET", undefined, { authorization: `Bearer ${token}` })).status).toBe(401);
    expect(s.called()).toBe(false);
  });
  it.each([["NOT_FOUND", 404], ["CONFLICT", 409], ["UPSTREAM_INVALID_RESPONSE", 502], ["SOURCE_TRUNCATED", 502], ["SOURCE_UNAVAILABLE", 503], ["UPSTREAM_TIMEOUT", 504]] as const)(
    "maps typed %s safely on grants", async (code, status) => {
      expect(await (await start({ failure: new AdminMemberProvisioningError(code) })).call(`/${id}/grants`)).toMatchObject({ status, body: { error: { code, requestId } } });
    });
  it("guards target, workspace shape and private fields, and does not reflect raw errors", async () => {
    for (const grants of [{ workspaceId: "foreign", data: { identityId: id, items: [] } }, { workspaceId: targetWorkspace, data: { identityId: auth.userId, items: [] } },
      { workspaceId: targetWorkspace, data: { identityId: id, items: [], secret: "hidden" } }, { workspaceId: targetWorkspace, data: { identityId: id, items: [] }, extra: 1 }]) {
      const r = await (await start({ results: { grants } })).call(`/${id}/grants`); expect(r.status).toBe(502); expect(JSON.stringify(r.body)).not.toContain("hidden");
    }
    expect((await (await start({ missing: true })).call(`/${id}/grants`)).status).toBe(503);
    const bad = await (await start({ failure: new Error("secret SQL") })).call(`/${id}`, "PATCH", { role: "lead" });
    expect(bad.status).toBe(500); expect(JSON.stringify(bad.body)).not.toContain("secret");
  });
  it.each(["", `/${id}/grants`])("applies exact byte limit to %s", async p => {
    const data = p ? { identityId: id, items: [grant] } : { items: [] };
    const size = Buffer.byteLength(JSON.stringify({ ok: true, data, meta: { requestId, dataAsOf: null, businessDate: "2026-09-08", workspaceKind: "personal", selectedSource: "platform" } }));
    expect((await (await start({ max: size + 1 })).call(p)).status).toBe(200); expect((await (await start({ max: size })).call(p)).status).toBe(502);
  });
});
