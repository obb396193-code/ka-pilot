import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { MetricsRepository } from "../src/metrics-repository.js";

const workspaceId = "00000000-0000-4000-8000-000000000080";
const key = { media: "KUAISHOU", accountId: "synthetic", ds: "2026-08-01" };
const row = { workspace_id: workspaceId, media: key.media, account_id: key.accountId, ds: key.ds, coefficient: "0.7812", coefficient_op: "multiply", assessment_price: "30" };
const harness = (value: Record<string, unknown>) => {
  const query = vi.fn(async () => ({ rows: [value] }));
  return { query, repository: new MetricsRepository({ query } as unknown as Pool) };
};
describe("effective metric settings direction", () => {
  it("loads op and coefficient from the same effective row, scoped to workspace/media/date", async () => {
    const { query, repository } = harness(row);
    expect(await repository.loadEffectiveSettingsBatch(workspaceId, [key])).toEqual([{ workspaceId, ...key, channelCoefficient: 0.7812, channelCoefficientOp: "multiply", assessmentPrice: 30 }]);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("value.coefficient, value.op");
    expect(sql).toContain("value.effective_date <= requested.ds");
    expect(sql).toContain("value.media = account.media");
    expect(params[0]).toBe(workspaceId);
  });
  it("keeps a missing effective config null instead of supplying divide", async () => {
    const { repository } = harness({ ...row, coefficient: null, coefficient_op: null, assessment_price: null });
    expect((await repository.loadEffectiveSettingsBatch(workspaceId, [key]))[0]).toMatchObject({ channelCoefficient: null, channelCoefficientOp: null, assessmentPrice: null });
  });
  it.each([
    { coefficient_op: "other" }, { coefficient_op: null }, { coefficient_op: undefined },
    { coefficient: null }, { coefficient: "NaN" }, { coefficient: "" }, { coefficient: "0x1" }, { coefficient: 0 },
    { assessment_price: "Infinity" }, { workspace_id: "00000000-0000-4000-8000-000000000081" },
  ])("rejects present-invalid configuration or scope %j", async (patch) => {
    await expect(harness({ ...row, ...patch }).repository.loadEffectiveSettingsBatch(workspaceId, [key])).rejects.toThrow();
  });
});
