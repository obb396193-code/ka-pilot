import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { SettingsChangeLogError } from "@ka/db";
import { createSettingsChangeLogRoute } from "../src/r010/settings-change-log-route.js";

const auth: ApprovedWorkspaceAuthContext = { workspaceId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002",
  role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
const valid = { ok: true as const, data: { items: [], nextCursor: null }, meta: { requestId: "change-log-test" } };
function setup() { const service = { read: vi.fn(async () => valid) }; return { service, route: createSettingsChangeLogRoute(service) }; }
async function call(s: ReturnType<typeof setup>, search = "", method = "GET", rawAuth: unknown = auth, maxResponseBytes = 16 * 1024 * 1024) {
  const request = Readable.from([]) as IncomingMessage; request.method = method;
  let status = 0, text = "", headers: Record<string, unknown> = {};
  const response = { writeHead(code: number, fields: Record<string, unknown>) { status = code; headers = fields; }, end(body: string) { text = body; } } as unknown as ServerResponse;
  await s.route.handle({ request, response, url: new URL(`http://test.invalid/api/v1/settings/change-log${search}`), auth: rawAuth as ApprovedWorkspaceAuthContext,
    requestId: "change-log-test", maxResponseBytes });
  return { status, body: JSON.parse(text), headers };
}
describe("P194 history GET route", () => {
  it("claims the exact path, keeps canonical envelope and forwarded server auth", async () => {
    const s = setup(); expect(s.route.matches("/api/v1/settings/change-log")).toBe(true); expect(s.route.matches("/api/v1/settings/change-log/execute")).toBe(false);
    expect(await call(s, "?kinds=assessment_price,daily_budget_cap&task_id=task&media=KUAISHOU")).toMatchObject({ status: 200, body: valid, headers: { "x-request-id": "change-log-test", "cache-control": "no-store" } });
    expect(s.service.read).toHaveBeenCalledWith(auth, { kinds: ["assessment_price", "daily_budget_cap"], task_id: "task", media: "KUAISHOU" }, "change-log-test");
  });
  it.each(["?workspaceId=other", "?scope=*", "?kinds=nope", "?kinds=", "?media=KUAISHOU&media=TENCENT", "?task_id=", "?page=2"])("rejects unknown/duplicate/invalid query %s before service", async search => {
    const s = setup(); expect((await call(s, search)).status).toBe(400); expect(s.service.read).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])("does not open %s", async method => {
    const s = setup(); expect(await call(s, "", method)).toMatchObject({ status: 405, headers: { allow: "GET" } }); expect(s.service.read).not.toHaveBeenCalled();
  });
  it("rejects malformed authorization and accepts approved team read context", async () => {
    const s = setup(); expect((await call(s, "", "GET", {})).status).toBe(403);
    const team = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
    expect((await call(s, "", "GET", team)).status).toBe(200); expect(s.service.read).toHaveBeenCalledWith(team, {}, "change-log-test");
  });
  it.each([["INVALID_REQUEST", 400], ["FORBIDDEN", 403], ["UPSTREAM_INVALID_RESPONSE", 502], ["SOURCE_UNAVAILABLE", 503], ["UPSTREAM_TIMEOUT", 504]] as const)("preserves %s safely", async (code, status) => {
    const s = setup(); s.service.read.mockRejectedValue(new SettingsChangeLogError(code));
    expect(await call(s)).toMatchObject({ status, body: { ok: false, error: { code, requestId: "change-log-test" } } });
  });
  it("fails closed on missing service, unknown exceptions and mismatched requestId", async () => {
    const s = setup(); s.route = createSettingsChangeLogRoute(undefined); expect((await call(s)).status).toBe(503);
    s.route = createSettingsChangeLogRoute(s.service); s.service.read.mockRejectedValue(new Error("SELECT credentials"));
    const failed = await call(s); expect(failed.status).toBe(500); expect(JSON.stringify(failed.body)).not.toContain("credentials");
    s.service.read.mockResolvedValue({ ...valid, meta: { requestId: "different" } }); expect((await call(s)).status).toBe(502);
  });
  it("rejects exact and oversized response boundary", async () => {
    const s = setup(), size = Buffer.byteLength(JSON.stringify(valid));
    expect((await call(s, "", "GET", auth, size + 1)).status).toBe(200);
    for (const limit of [size, size - 1]) expect(await call(s, "", "GET", auth, limit)).toMatchObject({ status: 502, body: { error: { code: "SOURCE_TRUNCATED" } } });
  });
});
