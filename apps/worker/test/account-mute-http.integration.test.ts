import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { createAccountMuteRoutes } from "../src/r010/account-mute-routes.js";

// Real transport only. This harness injects synthetic server-approved context;
// it is NOT the application's login/session composition or a production server.
const auth: ApprovedWorkspaceAuthContext = {
  workspaceId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002",
  workspaceKind: "personal", role: "optimizer", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "read" }] },
};
const valid = { mutedUntil: "2026-09-09T03:00:00+08:00", scope: "notifications_and_p1p2" as const };
describe("R010 mute real HTTP transport", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } });
  async function start(maxRequestBytes: number) {
    const service = { mute: vi.fn(async () => valid), ignoreAndMute: vi.fn(async () => valid) };
    const routes = createAccountMuteRoutes(service);
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://synthetic.invalid"), route = routes.find(r => r.matches(url.pathname));
      if (!route) { response.writeHead(404); response.end(); return; }
      void route.handle({ request, response, url, auth, requestId: "http-synthetic", maxRequestBytes, maxResponseBytes: 16 * 1024 * 1024 });
    });
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    servers.push(server);
    const address = server.address(); if (address === null || typeof address === "string") throw new Error("Missing synthetic listener");
    return { url: `http://127.0.0.1:${address.port}/api/v1/accounts/KUAISHOU/account-1/mute`, service };
  }
  it("success crosses real HTTP with the same requestId and no-store", async () => {
    const s = await start(1024);
    const response = await fetch(s.url, { method: "POST", headers: { "content-type": "application/json", "x-ka-account-scope": "*" }, body: JSON.stringify({ days: 1, reason_chip: "synthetic" }) });
    expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toBe("http-synthetic");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: valid, meta: { requestId: "http-synthetic" } });
  });
  it("oversize real body returns stable 413 instead of resetting the socket; no command runs", async () => {
    const s = await start(64);
    const response = await fetch(s.url, { method: "POST", body: JSON.stringify({ days: 1, reason_chip: "合成".repeat(1000) }) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST", requestId: "http-synthetic" } });
    expect(s.service.mute).not.toHaveBeenCalled();
  });
});
