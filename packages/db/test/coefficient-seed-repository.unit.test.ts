import { describe, expect, it, vi } from "vitest";
import { initialCoefficientSeedRows } from "@ka/domain";
import { CoefficientSeedRepository } from "../src/coefficient-seed-repository.js";

const input = { workspace_id: "00000000-0000-4000-8000-000000000080", effective_date: "2026-08-01" };
function setup(rows: Record<string, unknown>[] = [], workspaceRows: Record<string, unknown>[] = [{ kind: "personal", is_active: true }]) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("coefficient-seed-workspace")) {
      expect(values).toEqual([input.workspace_id]);
      return { rows: workspaceRows, rowCount: workspaceRows.length };
    }
    if (sql.includes("coefficient-seed-existing")) return { rows, rowCount: rows.length };
    return { rows: [], rowCount: sql.startsWith("INSERT") ? 1 : 0 };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) };
  return { query, release, pool, repository: new CoefficientSeedRepository(pool) };
}
const existing = () => initialCoefficientSeedRows().map((row) => ({ ...row, effective_date: input.effective_date }));

describe("coefficient seed transaction boundaries", () => {
  it("validates before DB and never logs raw error values", async () => {
    const harness = setup();
    await expect(harness.repository.seed({ ...input, password: "secret" })).rejects.toThrow(/^Coefficient seed failed$/);
    expect(harness.pool.connect).not.toHaveBeenCalled();
  });
  it("locks one active personal workspace and inserts only missing initial rows", async () => {
    const harness = setup();
    expect(await harness.repository.seed(input)).toEqual({ inserted: 4, skipped: 0 });
    const calls = harness.query.mock.calls;
    expect(calls[0]?.[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
    expect(calls.find(([sql]) => sql.includes("coefficient-seed-workspace"))?.[0]).toContain("FOR UPDATE");
    expect(calls.find(([sql]) => sql.includes("coefficient-seed-existing"))?.[0]).toContain("LIMIT 5");
    expect(calls.filter(([sql]) => sql.startsWith("INSERT"))).toHaveLength(4);
    for (const [sql, values] of calls.filter(([sql]) => sql.startsWith("INSERT"))) {
      expect(sql).not.toContain(input.workspace_id);
      expect(values?.[0]).toBe(input.workspace_id);
      expect(values?.[4]).toBe(input.effective_date);
    }
    expect(calls.at(-1)?.[0]).toBe("COMMIT");
    expect(harness.release).toHaveBeenCalledTimes(1);
    expect(calls.map(([sql]) => sql).join(" ")).not.toMatch(/UPDATE channel_coefficients|DELETE|DROP|ALTER/);
  });
  it("replays exact initial versions including decimal trailing zeros without writes", async () => {
    const rows = existing(); rows[0]!.coefficient = "00.781200";
    const harness = setup(rows);
    expect(await harness.repository.seed(input)).toEqual({ inserted: 0, skipped: 4 });
    expect(harness.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
  });
  it("completes a previously seeded exact subset", async () => {
    expect(await setup(existing().slice(0, 2)).repository.seed(input)).toEqual({ inserted: 2, skipped: 2 });
  });
  it.each([
    { coefficient: "0.78120000000000000001" }, { coefficient: "NaN" }, { coefficient: null },
    { coefficient: 0.7812 }, { op: "divide" }, { effective_date: "2026-07-01" }, { media: "UNKNOWN" },
  ])("rejects existing conflicting/present-invalid record %j before insert", async (patch) => {
    const harness = setup([{ ...existing()[0], ...patch }]);
    await expect(harness.repository.seed(input)).rejects.toThrow(/^Coefficient seed failed$/);
    expect(harness.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    expect(harness.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(harness.release).toHaveBeenCalledTimes(1);
  });
  it.each([[], [{ kind: "team", is_active: true }], [{ kind: "personal", is_active: false }], [{ kind: "personal", is_active: null }]].map((rows) => ({ rows })))("rejects missing/team/inactive workspace $rows", async ({ rows }) => {
    const harness = setup([], rows);
    await expect(harness.repository.seed(input)).rejects.toThrow();
    expect(harness.query.mock.calls.some(([sql]) => sql.includes("coefficient-seed-existing"))).toBe(false);
  });
  it("rejects duplicate/overflow history rather than treating it as seed success", async () => {
    for (const rows of [[...existing(), existing()[0]!], [existing()[0]!, existing()[0]!]]) {
      const harness = setup(rows);
      await expect(harness.repository.seed(input)).rejects.toThrow();
      expect(harness.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    }
  });
  it("rolls back earlier inserts when any later insert fails", async () => {
    const harness = setup();
    const original = harness.query.getMockImplementation()!;
    let inserts = 0;
    harness.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith("INSERT") && ++inserts === 2) throw new Error("postgres://private select sensitive");
      return original(sql, values);
    });
    await expect(harness.repository.seed(input)).rejects.toThrow(/^Coefficient seed failed$/);
    expect(harness.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(harness.release).toHaveBeenCalledTimes(1);
  });
  it("retries only a rolled-back serialization conflict with the same input", async () => {
    const harness = setup();
    harness.query.mockRejectedValueOnce(Object.assign(new Error("private"), { code: "40001" }));
    expect(await harness.repository.seed(input)).toEqual({ inserted: 4, skipped: 0 });
    expect(harness.pool.connect).toHaveBeenCalledTimes(2);
    expect(harness.release).toHaveBeenCalledTimes(2);
  });
  it("bounds serialization retries and destroys a connection if rollback fails", async () => {
    const harness = setup();
    const original = harness.query.getMockImplementation()!;
    harness.query.mockImplementation(async (sql, values) => {
      if (sql === "BEGIN ISOLATION LEVEL SERIALIZABLE") throw Object.assign(new Error("private"), { code: "40001" });
      return original(sql, values);
    });
    await expect(harness.repository.seed(input)).rejects.toThrow(/^Coefficient seed failed$/);
    expect(harness.pool.connect).toHaveBeenCalledTimes(3);
    const broken = setup(); broken.query.mockRejectedValue(new Error("broken"));
    await expect(broken.repository.seed(input)).rejects.toThrow(/^Coefficient seed failed$/);
    expect(broken.release).toHaveBeenCalledWith(true);
  });
});
