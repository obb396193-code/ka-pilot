import { describe, expect, it, vi } from "vitest";
import { WindowAssessmentRepository } from "../src/window-assessment-repository.js";

const scope = { workspaceId: "00000000-0000-4000-8000-000000000003", dateFrom: "2026-09-01", dateTo: "2026-09-02",
  filters: { accountScopes: [{ media: "KUAISHOU", accountId: "synthetic" }] } };
describe("account window target counts SQL contract", () => {
  it("counts task-effective dates while rejecting duplicate same-day task joins", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ total: 1, determinable: 1, on_target: 1, invalid: false }] });
    await new WindowAssessmentRepository({ query } as never).loadAccountCounts({ ...scope, filters: { ...scope.filters, taskId: "task-a" } });
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("count(DISTINCT metric.ds) AS eligible_days");
    expect(sql).toContain("members<>eligible_days");
    expect(sql).not.toContain("task-a"); expect(values).toContain("task-a");
    expect(values.at(-1)).not.toBe(2);
  });
  it("uses one parameterized expected-day query and preserves authorized tuples", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ total: 1, determinable: 1, on_target: 0, invalid: false }] });
    expect(await new WindowAssessmentRepository({ query } as never).loadAccountCounts(scope)).toEqual({ total: 1, determinable: 1, onTarget: 0 });
    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("expected_metric"); expect(sql).toContain("GROUP BY metric.media, metric.account_id");
    expect(sql).toContain("assessment.price * metric.real_conversion");
    expect(sql).not.toContain("synthetic"); expect(JSON.stringify(values)).toContain("synthetic");
  });
  it.each([
    [], [{ total: 1, determinable: 1, on_target: 1, invalid: true }],
    [{ total: 1, determinable: 2, on_target: 1, invalid: false }],
    [{ total: 1, determinable: 1, on_target: -1, invalid: false }],
    [{ total: "1", determinable: 1, on_target: 1, invalid: false }],
    [{ total: 1001, determinable: 0, on_target: 0, invalid: false }],
  ].map((rows) => ({ rows })))("rejects malformed, corrupt or widened counts", async ({ rows }) => {
    const query = vi.fn().mockResolvedValue({ rows });
    await expect(new WindowAssessmentRepository({ query } as never).loadAccountCounts(scope)).rejects.toThrow();
  });
  it("requires explicit bounded account scope before calling DB", async () => {
    const query = vi.fn();
    await expect(new WindowAssessmentRepository({ query } as never).loadAccountCounts({ ...scope, filters: {} })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("returns a genuine empty authorized aggregate without fabricating a rate", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ total: 0, determinable: 0, on_target: 0, invalid: false }] });
    expect(await new WindowAssessmentRepository({ query } as never).loadAccountCounts({ ...scope, filters: { accountScopes: [] } })).toEqual({ total: 0, determinable: 0, onTarget: 0 });
  });
});

describe("shared daily-history SQL decoder regression", () => {
  const row = { ds: "2026-09-01", cash_cost: "22.5", real_conversion: "1", version_id: "price-id", price: "20", effective_date: "2026-09-01" };
  it("retains finite values and real history while missing history remains null", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row, { ...row, price: null, version_id: null, effective_date: null, cash_cost: null }] });
    const result = await new WindowAssessmentRepository({ query } as never).load(scope);
    expect(result[0]).toMatchObject({ cashCost: { value: 22.5, availability: "available" }, price: { value: 20, versionKey: "price-id" } });
    expect(result[1]).toMatchObject({ cashCost: { value: null, availability: "missing" }, price: null });
  });
  it.each(["NaN", "Infinity", "bad", true, {}, undefined])("refuses present-invalid history numeric values", async (cash_cost) => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...row, cash_cost }] });
    await expect(new WindowAssessmentRepository({ query } as never).load(scope)).rejects.toThrow();
  });
  it("does not accept incomplete version metadata or impossible dates", async () => {
    for (const bad of [{ ...row, effective_date: null }, { ...row, ds: "2026-02-31" }]) {
      const query = vi.fn().mockResolvedValue({ rows: [bad] });
      await expect(new WindowAssessmentRepository({ query } as never).load(scope)).rejects.toThrow();
    }
  });
  it("refuses overflow sentinel and oversized driver payload", async () => {
    for (const rows of [Array(10001).fill(row), [{ ...row, version_id: "a".repeat(16 * 1024 * 1024) }]]) {
      const query = vi.fn().mockResolvedValue({ rows });
      await expect(new WindowAssessmentRepository({ query } as never).load(scope)).rejects.toThrow("Assessment input exceeds query boundary");
    }
  });
});
