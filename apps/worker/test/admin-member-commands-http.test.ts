import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminMemberProvisioningError } from "@ka/db";
import { AdminMembersService } from "../src/admin/members-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";
const token = "synthetic-p211-service-token-long-enough", requestId = "p211-http";
const auth = personalAuth({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", accounts: [] });
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../packages/contract/fixtures/admin/${name}.json`, import.meta.url), "utf8")).data;
const created = fixture("member-created"), reset = fixture("member-reset-password"), id = created.identityId;
const input = { display_name: created.displayName, provider: "internal_test", provider_subject: created.loginName, role: "optimizer" };
describe("F-OS-004 command HTTP", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); } });
  async function start(options: { result?: unknown; error?: unknown; max?: number; maxRequest?: number; role?: typeof auth.role; missing?: boolean } = {}) {
    const invoke = (data: unknown) => async () => { if (options.error) throw options.error; return options.result ?? data; };
    const global = { read: vi.fn(invoke({ items: [] })), create: vi.fn(invoke(created)), resetPassword: vi.fn(invoke(reset)) };
    const local = { read: vi.fn(async () => ({ workspaceId: auth.workspaceId, data: { identityId: id, items: [] } })) };
    const service = new AdminMembersService(local, () => new Date("2026-09-10T01:00:00Z"), options.missing ? undefined : global);
    const unused = new Proxy({}, { get() { throw new Error("Unrelated service called"); } });
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken: token, sessionAuthService: approvedSessionAuth({ ...auth, role: options.role ?? "optimizer" }),
      adminMembersService: service, maxResponseBytes: options.max, maxRequestBytes: options.maxRequest,
    } as unknown as DataApiServerOptions); servers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing listener");
    return { global, local, call: async (path = "", method = "POST", body: unknown = input, headers = businessHeaders(token)) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/admin/members${path}`, { method,
        headers: { ...headers, "content-type": "application/json", "x-request-id": requestId, "x-ka-role": "admin" },
        ...(["GET", "HEAD"].includes(method) ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
      return { status: response.status, headers: response.headers, body: await response.json() };
    } };
  }
  it("POST creates with 201 and once-only no-store password; local role does not replace DB entitlement", async () => {
    const s = await start(), response = await s.call();
    expect(response).toMatchObject({ status: 201, body: { ok: true, data: created, meta: { requestId, dataAsOf: null } } });
    expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(s.global.create).toHaveBeenCalledWith(expect.objectContaining({ role: "optimizer" }), input);
    expect(s.local.read).not.toHaveBeenCalled();
  });
  it("reset passes only server-approved context and target to repository", async () => {
    const s = await start(); expect(await s.call(`/${id}/reset-password`, "POST", {})).toMatchObject({ status: 200, body: { data: reset } });
    expect(s.global.resetPassword).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: auth.workspaceId }), id);
  });
  it.each([["CONFLICT",409], ["FORBIDDEN",403], ["NOT_FOUND",404], ["UPSTREAM_TIMEOUT",504], ["SOURCE_UNAVAILABLE",503], ["UPSTREAM_INVALID_RESPONSE",502]] as const)("stable %s => %d", async (code, status) => {
    const s = await start({ error: new AdminMemberProvisioningError(code) });
    for (const [path, body] of [["", input], [`/${id}/reset-password`, {}]] as const) expect(await s.call(path, "POST", body)).toMatchObject({ status, body: { error: { code, requestId, retryable: false } } });
  });
  it("rejects viewer and missing session before ports", async () => {
    const s = await start({ role: "viewer" });
    for (const path of ["", `/${id}/reset-password`]) expect(await s.call(path)).toMatchObject({ status: 403, body: { error: { code: "READ_ONLY_ROLE" } } });
    expect(s.global.create).not.toHaveBeenCalled(); expect(s.global.resetPassword).not.toHaveBeenCalled();
    const other = await start(); expect((await other.call("", "POST", input, {})).status).toBe(401); expect(other.global.create).not.toHaveBeenCalled();
  });
  it("malformed request/query/identity never writes", async () => {
    const s = await start();
    for (const body of ["{", {}, { ...input, workspaceId: "forged" }, { ...input, initial_password: "short" }]) expect((await s.call("", "POST", body)).status).toBe(400);
    expect((await s.call("?scope=all")).status).toBe(400);
    expect((await s.call("/invalid/reset-password", "POST", {})).status).toBe(400);
    expect((await s.call(`/${id}/reset-password`, "POST", { initialPassword: "forged" })).status).toBe(400);
    expect(s.global.create).not.toHaveBeenCalled(); expect(s.global.resetPassword).not.toHaveBeenCalled();
  });
  it("strict methods and request size", async () => {
    const s = await start(); for (const method of ["PUT", "PATCH", "DELETE"]) expect((await s.call("", method)).status).toBe(405);
    expect((await s.call(`/${id}/reset-password`, "GET")).status).toBe(405);
    const bounded = await start({ maxRequest: 20 }); expect((await bounded.call()).status).toBe(413); expect(bounded.global.create).not.toHaveBeenCalled();
  });
  it("missing global adapter never falls back to old local list", async () => {
    const s = await start({ missing: true }); expect((await s.call()).status).toBe(503); expect((await s.call("", "GET")).status).toBe(503); expect(s.local.read).not.toHaveBeenCalled();
  });
  it("rejects malformed/sensitive output and hides unknown errors", async () => {
    expect((await (await start({ result: { ...created, token: "secret" } })).call()).status).toBe(502);
    const response = await (await start({ error: new Error("private SQL secret") })).call(); expect(response.status).toBe(500); expect(JSON.stringify(response.body)).not.toMatch(/private|SQL|secret/);
  });
  it("exact response budget rejects created and reset payloads", async () => {
    for (const [path, data, request] of [["", created, input], [`/${id}/reset-password`, reset, {}]] as const) {
      const bytes = Buffer.byteLength(JSON.stringify({ ok: true, data, meta: { requestId, dataAsOf: null, businessDate: "2026-09-10", workspaceKind: "personal", selectedSource: "platform" } }));
      expect((await (await start({ max: bytes })).call(path, "POST", request)).status).toBe(502);
      expect((await (await start({ max: bytes + 1 })).call(path, "POST", request)).status).toBe(path ? 200 : 201);
    }
  });
});
