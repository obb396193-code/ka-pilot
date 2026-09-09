import { describe, expect, it, vi } from "vitest";
import { EtlRunListService } from "../src/admin/etl-run-list-service.js";
const auth = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", role: "admin",
  workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
describe("ETL run list service boundary", () => {
  it("validates auth/request/requestId before DB, even without HTTP wrapper", async () => {
    const list = vi.fn(), service = new EtlRunListService({ list });
    await expect(service.list(null, {}, "test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.list({ ...auth, role: "optimizer" }, {}, "test")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.list(auth, { scope: "all" }, "test")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(service.list(auth, {}, "bad\nrequestId")).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(list).not.toHaveBeenCalled();
  });
  it.each([null, [], 1, {}, { workspaceId: auth.workspaceId, data: {} }])("rejects missing/invalid snapshot %#", async result => {
    const service = new EtlRunListService({ list: async () => result });
    await expect(service.list(auth, {}, "test")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("request business day obeys Shanghai 03:00 without fabricating data observation time", async () => {
    const result = { workspaceId: auth.workspaceId, data: { items: [], total: 0, page: 1, pageSize: 50 }, dataAsOf: null };
    for (const [time, date] of [["2026-09-08T18:59:59Z", "2026-09-08"], ["2026-09-08T19:00:00Z", "2026-09-09"]]) {
      const service = new EtlRunListService({ list: async () => result }, () => new Date(time!));
      expect(await service.list(auth, {}, "test")).toMatchObject({ meta: { businessDate: date, dataAsOf: null } });
    }
  });
});
