import { describe, expect, it, vi } from "vitest";
import { DashboardAccountDaysRepository } from "../src/dashboard-account-days-repository.js";
const ws = "11111111-1111-4111-8111-111111111111";
const request = { workspaceId: ws, accounts: [{ media: "KUAISHOU", accountId: "a" }], dateFrom: "2026-09-01", dateTo: "2026-09-02" };
const row = { workspace_id: ws, media: "KUAISHOU", account_id: "a", ds: "2026-09-01", oversized: false, task_id: null, task_name: null, biz_name: null };
describe("dashboard metadata strict/bounded reader", () => {
  it("uses tuple parameters, fixed limit and cost-independent expected membership", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    expect(await new DashboardAccountDaysRepository({ query }).load(request)).toMatchObject([{ taskId: null, taskName: null, bizName: null }]);
    const [sql, args] = query.mock.calls[0]!;
    expect(sql).toContain("LIMIT 10001"); expect(sql).toContain('account.media=wanted.media');
    expect(args).toEqual([ws, JSON.stringify(request.accounts), request.dateFrom, request.dateTo]);
    expect(sql).not.toContain("cost>");
  });
  it.each([null, [row, row], [{ ...row, workspace_id: "22222222-2222-4222-8222-222222222222" }], [{ ...row, media: "TENCENT" }],
    [{ ...row, ds: "2026-02-31" }], [{ ...row, ds: "2026-09-03" }], [{ ...row, task_name: false }], [{ ...row, oversized: "false" }]].map(rows => ({ rows })))("rejects malformed/foreign rows", ({ rows }) => {
    const query = vi.fn().mockResolvedValue({ rows });
    return expect(new DashboardAccountDaysRepository({ query }).load(request)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([[{ ...row, oversized: true }], Array.from({ length: 10001 }, () => row), [{ ...row, task_name: "x".repeat(16 * 1024 * 1024) }]].map(rows => ({ rows })))("rejects cap or byte sentinel", ({ rows }) => {
    return expect(new DashboardAccountDaysRepository({ query: vi.fn().mockResolvedValue({ rows }) }).load(request)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it("rejects oversized grids and invalid input before SQL; empty grants never discover", async () => {
    const query = vi.fn(), repository = new DashboardAccountDaysRepository({ query });
    await expect(repository.load({ ...request, dateTo: "2026-09-31" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(repository.load({ ...request, accounts: Array.from({ length: 1000 }, (_, i) => ({ media: "KUAISHOU", accountId: String(i) })), dateTo: "2026-09-30" })).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    expect(await repository.load({ ...request, accounts: [] })).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
