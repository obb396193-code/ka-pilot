import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SettingsChangeLogError } from "@ka/db";
import { SettingsChangeLogService } from "../src/admin/settings-change-log-service.js";
const fixture = JSON.parse(readFileSync(new URL("../../../packages/contract/fixtures/settings/change-log-v1944.json", import.meta.url), "utf8"));
const auth = { workspaceId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002",
  role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
function setup() {
  const repository = { page: vi.fn(async () => ({ workspaceId: auth.workspaceId, data: fixture.data })) };
  return { repository, service: new SettingsChangeLogService(repository, () => new Date("2026-09-13T02:59:59+08:00")) };
}
describe("P194 change log service", () => {
  it("keeps canonical shape/requestId and uses Shanghai03 business day only for authorization", async () => {
    const s = setup(), result = await s.service.read(auth, {}, fixture.meta.requestId);
    expect(result).toEqual(fixture);
    expect(s.repository.page).toHaveBeenCalledWith(auth, {}, "2026-09-12");
  });
  it("parses context/filter before storage, never lets browser authority fields through", async () => {
    const s = setup();
    await expect(s.service.read({ ...auth, arbitrary: "scope" }, {}, "test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(s.service.read(auth, { workspaceId: "forged" }, "test")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(s.repository.page).not.toHaveBeenCalled();
  });
  it.each(["SOURCE_UNAVAILABLE", "FORBIDDEN", "UPSTREAM_TIMEOUT", "UPSTREAM_INVALID_RESPONSE"] as const)("preserves typed %s", async code => {
    const s = setup(); s.repository.page.mockRejectedValue(new SettingsChangeLogError(code));
    await expect(s.service.read(auth, {}, "test")).rejects.toMatchObject({ code });
  });
  it.each([
    { workspaceId: auth.userId, data: fixture.data }, { workspaceId: auth.workspaceId, data: { items: [], nextCursor: null }, secret: "raw" },
    { workspaceId: auth.workspaceId, data: { items: [{ ...fixture.data.items[0], newValue: "NaN" }], nextCursor: null } },
  ])("rejects malformed or cross-workspace repository snapshot", async raw => {
    const s = setup(); s.repository.page.mockResolvedValue(raw);
    await expect(s.service.read(auth, {}, "test")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("checks requested kind and task id against returned rows", async () => {
    const s = setup();
    await expect(s.service.read(auth, { kinds: ["assessment_price"] }, "test")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    await expect(s.service.read(auth, { task_id: "different" }, "test")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("task filter includes its authorized channel coefficient without inventing taskId on media rows", async () => {
    const s = setup();
    expect((await s.service.read(auth, { task_id: "allowed" }, fixture.meta.requestId)).data).toEqual(fixture.data);
  });
  it("rejects a coefficient from a media outside personal grants", async () => {
    const s = setup();
    s.repository.page.mockResolvedValue({ workspaceId: auth.workspaceId, data: {
      items: [{ ...fixture.data.items[0], scope: { media: "TENCENT" } }], nextCursor: null,
    } });
    await expect(s.service.read(auth, {}, "test")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("sanitizes unknown errors", async () => {
    const s = setup(); s.repository.page.mockRejectedValue(new Error("SELECT private credential"));
    await expect(s.service.read(auth, {}, "test")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", message: "Change log SOURCE_UNAVAILABLE" });
  });
});
