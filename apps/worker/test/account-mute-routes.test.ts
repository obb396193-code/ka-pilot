import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { createAccountMuteRoutes } from "../src/r010/account-mute-routes.js";
import { AccountMuteServiceError } from "../src/work-items/account-mute-service.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const workItemId = "00000000-0000-4000-8000-000000000003";
const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "read" }] } };
const valid = { mutedUntil: "2026-09-09T03:00:00+08:00", scope: "notifications_and_p1p2" as const };
const mutePath = "/api/v1/accounts/KUAISHOU/account-1/mute";
const ignorePath = `/api/v1/work-items/${workItemId}/ignore`;
function setup() {
  const service = { mute: vi.fn(async () => valid), ignoreAndMute: vi.fn(async () => valid) };
  const routes = createAccountMuteRoutes(service);
  return { service, routes };
}
type Setup = ReturnType<typeof setup>;
async function call(s: Setup, options: { path?: string; method?: string; body?: unknown; rawBody?: string; auth?: unknown; maxResponseBytes?: number; maxRequestBytes?: number } = {}) {
  const url = new URL(options.path ?? mutePath, "http://synthetic.invalid");
  const request = Readable.from([Buffer.from(options.rawBody ?? JSON.stringify(options.body ?? { days: 1, reason_chip: "synthetic" }))]) as IncomingMessage;
  request.method = options.method ?? "POST";
  request.headers = { "content-type": "application/json", "x-ka-workspace-id": "foreign", "x-ka-user-id": "foreign", "x-ka-account-scope": "*" };
  let status = 0, headers: Record<string, unknown> = {}, text = "";
  const response = {
    writeHead(code: number, value: Record<string, unknown>) { status = code; headers = value; },
    end(value: string) { text = value; },
  } as unknown as ServerResponse;
  const route = s.routes.find(r => r.matches(url.pathname));
  if (!route) throw new Error("Missing test route");
  await route.handle({ request, response, url, auth: (options.auth ?? auth) as ApprovedWorkspaceAuthContext,
    requestId: "synthetic-request", maxResponseBytes: options.maxResponseBytes ?? 16 * 1024 * 1024,
    maxRequestBytes: options.maxRequestBytes ?? 1024 * 1024 });
  return { status, headers, body: JSON.parse(text) as Record<string, unknown>, text };
}
describe("R010 account mute route adapters (not production registration)", () => {
  it("claims only the two frozen paths", () => {
    const s = setup();
    for (const path of [mutePath, ignorePath]) expect(s.routes.filter(r => r.matches(path))).toHaveLength(1);
    for (const path of ["/api/v1/accounts", "/api/v1/accounts/KUAISHOU/account-1", `${ignorePath}/execute`, "/api/v1/changesets/x/execute"])
      expect(s.routes.some(r => r.matches(path))).toBe(false);
  });
  it("passes server approved context, ignores spoofed headers and returns canonical result", async () => {
    const s = setup(), response = await call(s);
    expect(response.status).toBe(200);
    expect(s.service.mute).toHaveBeenCalledWith(auth, { media: "KUAISHOU", accountId: "account-1" }, { days: 1, reason_chip: "synthetic" });
    expect(response.body).toEqual({ ok: true, data: valid, meta: { requestId: "synthetic-request" } });
    expect(response.headers["x-request-id"]).toBe("synthetic-request");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it("ignore+mute calls only the atomic command", async () => {
    const s = setup(), response = await call(s, { path: ignorePath, body: { mute_days: 3, reason_chip: "synthetic" } });
    expect(response.status).toBe(200);
    expect(s.service.ignoreAndMute).toHaveBeenCalledWith(auth, workItemId, { mute_days: 3, reason_chip: "synthetic" });
    expect(s.service.mute).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s before commands", async method => {
    const s = setup(), response = await call(s, { method });
    expect(response.status).toBe(405); expect(response.headers.allow).toBe("POST");
    expect(s.service.mute).not.toHaveBeenCalled();
  });
  it.each([
    { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } },
    { ...auth, scope: { kind: "explicit_accounts", accounts: [] } },
    { ...auth, userId: "invalid" },
  ])("rejects non-approved personal context before command", async value => {
    const s = setup(), response = await call(s, { auth: value });
    expect(response.status).toBe(403); expect(s.service.mute).not.toHaveBeenCalled();
  });
  it.each([
    { body: { days: 1, reason_chip: "ok", workspaceId: "foreign" } }, { body: { days: 2, reason_chip: "ok" } },
    { body: { days: 1 } }, { body: [] }, { rawBody: "{" },
    { path: `${mutePath}?dataSource=ka_data` }, { path: "/api/v1/accounts/KUAISHOU/%ZZ/mute" },
    { path: "/api/v1/accounts/KUAISHOU/account%2F1/mute" },
  ])("rejects malformed input before command %j", async options => {
    const s = setup(), response = await call(s, options);
    expect(response.status).toBe(400); expect(s.service.mute).not.toHaveBeenCalled();
  });
  it("does not let a known but unauthorized tuple reach the service", async () => {
    const s = setup(), response = await call(s, { path: "/api/v1/accounts/TENCENT/account-1/mute" });
    expect(response.status).toBe(403); expect(s.service.mute).not.toHaveBeenCalled();
  });
  it("plain ignore is valid but unavailable, not a fabricated success or malformed request", async () => {
    const s = setup(), response = await call(s, { path: ignorePath, body: {} });
    expect(response.status).toBe(503); expect(response.body).toMatchObject({ error: { code: "SOURCE_UNAVAILABLE" } });
    expect(s.service.ignoreAndMute).not.toHaveBeenCalled();
  });
  it.each([
    ["INVALID_REQUEST", 400], ["FORBIDDEN", 403], ["NOT_FOUND", 404], ["INVALID_STATE", 409],
    ["UPSTREAM_INVALID_RESPONSE", 502], ["INTERNAL_ERROR", 500],
  ] as const)("maps service %s to %i safely", async (code, status) => {
    const s = setup(); s.service.mute.mockRejectedValueOnce(new AccountMuteServiceError(code));
    const response = await call(s);
    expect(response.status).toBe(status); expect(response.body).toMatchObject({ ok: false, error: { code, requestId: "synthetic-request", retryable: false } });
  });
  it("does not expose untyped errors", async () => {
    const s = setup(); s.service.mute.mockRejectedValueOnce(new Error("SELECT secret token from synthetic"));
    const response = await call(s);
    expect(response.status).toBe(500); expect(response.text).not.toMatch(/SELECT|secret|token/);
  });
  it.each([{ ...valid, raw: "secret" }, { ...valid, mutedUntil: "invalid" }])("rejects invalid success result", async value => {
    const s = setup(); s.service.mute.mockResolvedValueOnce(value);
    const response = await call(s); expect(response.status).toBe(502); expect(response.text).not.toContain("secret");
  });
  it("enforces UTF8 request byte cap before command", async () => {
    const s = setup(), response = await call(s, { body: { days: 1, reason_chip: "合成" }, maxRequestBytes: 8 });
    expect(response.status).toBe(413); expect(s.service.mute).not.toHaveBeenCalled();
  });
  it("rejects response equal to the cap, not only greater; error retains requestId", async () => {
    const s = setup(), expected = { ok: true, data: valid, meta: { requestId: "synthetic-request" } };
    const bytes = Buffer.byteLength(JSON.stringify(expected));
    expect((await call(s, { maxResponseBytes: bytes + 1 })).status).toBe(200);
    const response = await call(s, { maxResponseBytes: bytes });
    expect(response.status).toBe(502); expect(response.body).toMatchObject({ error: { code: "SOURCE_TRUNCATED", requestId: "synthetic-request" } });
  });
});
