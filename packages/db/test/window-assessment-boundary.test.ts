import { describe, expect, it, vi } from "vitest";
import { WindowAssessmentRepository } from "../src/window-assessment-repository.js";

const scope = { workspaceId: "00000000-0000-4000-8000-000000000121", dateFrom: "2026-09-01", dateTo: "2026-09-01", filters: { accountScopes: [] } };
const row = { ds: "2026-09-01", cash_cost: "1", real_conversion: "1", version_id: "1", price: "1", effective_date: "2026-09-01" };
const repository = (rows: unknown[]) => new WindowAssessmentRepository({ query: vi.fn(async () => ({ rows })) } as never);
describe("assessment DB output limits and type checks", () => {
  it("trusted SQL extra-row sentinel allows 10000 but rejects 10001 and exact byte cap", async () => {
    expect(await repository(Array(10000).fill(row)).load(scope)).toHaveLength(10000);
    await expect(repository(Array(10001).fill(row)).load(scope)).rejects.toThrow("query boundary");
    const baseSize = Buffer.byteLength(JSON.stringify([{ ...row, version_id: "" }]));
    const oversized = { ...row, version_id: "x".repeat(16 * 1024 * 1024 - baseSize) };
    expect(Buffer.byteLength(JSON.stringify([oversized]))).toBe(16 * 1024 * 1024);
    await expect(repository([oversized]).load(scope)).rejects.toThrow("query boundary");
  });
  it.each([true, {}, [], "", "  ", "invalid", "0x10", Infinity])("present invalid numeric %s fails closed", async (value) => {
    await expect(repository([{ ...row, cash_cost: value }]).load(scope)).rejects.toThrow();
  });
  it("requires bounded explicit personal scope before executing SQL", async () => {
    const query = vi.fn(); const db = new WindowAssessmentRepository({ query } as never);
    await expect(db.load({ workspaceId: scope.workspaceId, dateFrom: scope.dateFrom, dateTo: scope.dateTo })).rejects.toThrow();
    await expect(db.load({ ...scope, dateTo: "9999-01-01" })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
