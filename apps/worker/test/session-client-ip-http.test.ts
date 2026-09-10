import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { SessionHttpService } from "../src/auth/session-http.js";
import { SessionAuthService } from "../src/auth/session-auth-service.js";

const internalToken = "synthetic-client-ip-internal-token-long-enough";
const workspaceId = "11111111-1111-4111-8111-111111111111", identityId = "22222222-2222-4222-8222-222222222222";
describe("trusted login source IP / actual HTTP shell", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
  async function start() {
    const issue = vi.fn(async () => false); // Stop after the limiter, no synthetic login success claim.
    const service = new SessionHttpService(new SessionAuthService({ resolveApprovedAuthContext: async () => {
      throw new Error("No session read expected");
    } }), { authenticate: async () => null }, { now: () => new Date("2026-09-10T01:00:00Z"),
      guest: { enabled: true, workspaceId, findGuestIdentity: async () => identityId, issueSession: issue } });
    const login = vi.spyOn(service, "login");
    const unused = new Proxy({}, { get() { throw new Error("Unrelated business service called"); } });
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused,
      workItemListService: unused, internalToken, sessionHttpService: service } as unknown as DataApiServerOptions);
    servers.push(server);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
    return { issue, login, call: async (ip?: string, method = "POST", bearer: string | null = internalToken) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/login`, { method,
        headers: { "content-type": "application/json", "x-request-id": "client-ip-test", ...(ip === undefined ? {} : { "x-forwarded-for": ip }),
          ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }) },
        ...(method === "POST" ? { body: JSON.stringify({ provider: "guest" }) } : {}) });
      const body = await response.json(); expect(response.headers.get("x-request-id")).toBe("client-ip-test");
      return { status: response.status, body };
    } };
  }
  it("uses two independent IP buckets through HTTP; changing a trailing proxy does not reset the first", async () => {
    const state = await start();
    for (let i = 0; i < 20; i++) expect((await state.call("203.0.113.7, 192.0.2.1")).status).toBe(401);
    expect(state.issue).toHaveBeenCalledTimes(20);
    expect((await state.call("203.0.113.7, 192.0.2.2")).status).toBe(403);
    expect(state.issue).toHaveBeenCalledTimes(20);
    expect((await state.call("203.0.113.8, 192.0.2.1")).status).toBe(401);
    expect(state.issue).toHaveBeenCalledTimes(21);
  });
  it.each(["203.0.113.7", " 203.0.113.7 , 192.0.2.1", "2001:db8::1"])("passes only the first valid address: %s", async ip => {
    const state = await start(); await state.call(ip);
    expect(state.login).toHaveBeenCalledWith({ provider: "guest" }, "client-ip-test", ip.split(",")[0]!.trim());
  });
  it.each([undefined, "", "not-an-ip,203.0.113.8", " ,203.0.113.8", "203.0.113.7:80"])("falls back to the socket on absent/invalid first address: %s", async ip => {
    const state = await start(); await state.call(ip);
    expect(state.login).toHaveBeenCalledWith({ provider: "guest" }, "client-ip-test", "127.0.0.1");
  });
  it("does not consume guest buckets for untrusted callers or wrong methods", async () => {
    const state = await start();
    expect((await state.call("203.0.113.7", "POST", null)).status).toBe(401);
    expect((await state.call("203.0.113.7", "POST", "wrong")).status).toBe(403);
    expect((await state.call("203.0.113.7", "GET")).status).toBe(405);
    expect(state.login).not.toHaveBeenCalled(); expect(state.issue).not.toHaveBeenCalled();
  });
});
