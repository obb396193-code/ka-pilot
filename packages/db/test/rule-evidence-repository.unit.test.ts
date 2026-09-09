import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { RuleEvidenceRepository } from "../src/rule-evidence-repository.js";

const ws = "11111111-1111-4111-8111-111111111111";
const auth = { workspaceId: ws, userId: "22222222-2222-4222-8222-222222222222", role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" },
    { media: "TENCENT", accountId: "same", accessLevel: "read" }] } };
const target = { ruleId: "9007199254740993", media: "KUAISHOU", accountId: "same", ds: "2026-09-08" };
const window = { from: target.ds, to: target.ds, preset: "custom" };
const definition = { id: target.ruleId, workspace_id: ws, enabled: true, scope: {},
  condition_tree: { version: "v1", all: [{ metric: "cash_cpa", operator: ">", threshold: "assessment_price" }] },
  availability_policy: "suppress", data_freshness_max_hours: null, fallback_copy: null };
function metric() {
  return { workspace_id: ws, media: target.media, account_id: target.accountId, ds: target.ds, observed: true,
    account_name: "synthetic", task_id: "task", task_name: "task", biz_name: "biz",
    cost: "40", cash_cost: "30", exposure: "100", click: "10", conversion: "2", real_conversion: "1",
    wake_uv: null, potential_uv: null, price_id: "3", price: "20", effective_date: target.ds, computed_at: null };
}
function setup(patch: object = {}, applicable = true, rows: unknown[] = [metric()]) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values; // Arguments are inspected by the spy; this driver returns fixed synthetic rows.
    if (sql.includes("rule-definition-row")) return { rows: [{ payload: { ...definition, ...patch }, payload_bytes: 500 }] };
    if (sql.includes("rule-definition-applicability")) return { rows: [{ account_exists: true, applicable }] };
    if (sql.includes("platform-pivot-members")) return { rows };
    return { rows: [] };
  });
  const client = Object.assign(new EventEmitter(), { query, release: vi.fn() });
  const connect = vi.fn(async () => client);
  return { query, connect, client, repository: new RuleEvidenceRepository({ connect } as never) };
}
describe("rule evidence repository", () => {
  it("reads definition/binding/metrics in exactly one RR and narrows even broader approved grants", async () => {
    const s = setup(), result = await s.repository.read(auth, target, window);
    expect(result).toMatchObject({ definition: { id: target.ruleId }, evaluation: { pass: true },
      evidence: { observation: { observedAccountDays: 1, missingComputedAt: 1 } } });
    expect(s.connect).toHaveBeenCalledOnce();
    expect(s.query.mock.calls.filter(([sql]) => sql.startsWith("BEGIN"))).toHaveLength(1);
    expect(s.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(s.query.mock.calls.find(([sql]) => sql.includes("platform-pivot-members"))?.[1]).toEqual([
      ws, target.ds, target.ds, JSON.stringify([{ media: "KUAISHOU", account_id: "same" }]),
    ]);
    expect(result).not.toHaveProperty("triggered"); expect(result).not.toHaveProperty("dataAsOf");
  });
  it.each([
    [{ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, target, window, "FORBIDDEN"],
    [auth, { ...target, accountId: "foreign" }, window, "FORBIDDEN"],
    [auth, target, { ...window, to: "2026-09-09" }, "INVALID_INPUT"],
    [{ ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }, target, window, "TEAM_SOURCE_UNAVAILABLE"],
  ])("rejects invalid scope/source before connection %#", async (context, object, date, code) => {
    const s = setup(); await expect(s.repository.read(context, object, date)).rejects.toMatchObject({ code });
    expect(s.connect).not.toHaveBeenCalled();
  });
  it.each([
    [{ enabled: false }, true, "DISABLED"], [{}, false, "OUTSIDE_RULE_SCOPE"], [{ condition_tree: null }, true, "LEGACY_TREE_UNAVAILABLE"],
  ])("does not read metrics or fabricate condition failure when not evaluable %#", async (patch, applies, reason) => {
    const s = setup(patch, applies as boolean);
    expect(await s.repository.read(auth, target, window)).toMatchObject({ evaluation: null, unavailableReason: reason, evidence: null });
    expect(s.query.mock.calls.some(([sql]) => sql.includes("platform-pivot-members"))).toBe(false);
  });
  it("missing rule remains null, no metric query", async () => {
    const s = setup(); s.query.mockImplementation(async () => ({ rows: [] }));
    expect(await s.repository.read(auth, target, window)).toBeNull();
  });
  it("hourly windows do not query daily data", async () => {
    const s = setup({ condition_tree: { version: "v1", all: [{ metric: "cash_cost", operator: ">", threshold: 1, window_hours: 1 }] } });
    await expect(s.repository.read(auth, target, window)).rejects.toMatchObject({ code: "HOURLY_SOURCE_REQUIRED" });
    expect(s.query.mock.calls.some(([sql]) => sql.includes("platform-pivot-members"))).toBe(false);
  });
  it("malicious metric adapter cannot widen media scope", async () => {
    const s = setup({}, true, [{ ...metric(), media: "TENCENT" }]);
    await expect(s.repository.read(auth, target, window)).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    expect(s.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("finite source operands overflowing weighted assessment fail safely", async () => {
    const s = setup({}, true, [{ ...metric(), price: Number.MAX_VALUE, real_conversion: 2 }]);
    await expect(s.repository.read(auth, target, window)).rejects.toThrow(/^Rule evidence read failed: INVALID_EVIDENCE$/);
    expect(s.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it("invalid auth and returned rule retain controlled errors", async () => {
    const s = setup({ enabled: "false" });
    await expect(s.repository.read({ ...auth, userId: "not-uuid" }, target, window)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.connect).not.toHaveBeenCalled();
    await expect(s.repository.read(auth, target, window)).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
  });
  it.each(["connect", "query", "commit"])("safe %s failure never returns evaluation or secret", async at => {
    const s = setup(), failure = new Error("synthetic secret SQL response");
    if (at === "connect") s.connect.mockRejectedValueOnce(failure);
    else {
      const original = s.query.getMockImplementation()!;
      s.query.mockImplementation(async (sql, values) => {
        if (sql === "COMMIT" && at === "commit" || sql.includes("platform-pivot-members") && at === "query") throw failure;
        return original(sql, values);
      });
    }
    await expect(s.repository.read(auth, target, window)).rejects.toThrow(/^Rule evidence read failed: SOURCE_UNAVAILABLE$/);
    if (at !== "connect") expect(s.client.release).toHaveBeenCalledOnce();
  });
});
