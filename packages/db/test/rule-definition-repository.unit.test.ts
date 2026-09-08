import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { RuleDefinitionRepository } from "../src/rule-definition-repository.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const auth = { workspaceId, userId: "22222222-2222-4222-8222-222222222222", role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
const target = { ruleId: "9007199254740993", media: "KUAISHOU", accountId: "same", ds: "2026-09-08" };
const payload = { id: target.ruleId, workspace_id: workspaceId, enabled: true,
  scope: {}, condition_tree: { version: "v1", all: [{ metric: "cash_cost", operator: ">", threshold: 20 }] },
  availability_policy: "suppress", data_freshness_max_hours: null, fallback_copy: null };

function setup(patch: object = {}, bytes = 500) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("rule-definition-row")) return { rows: [{ payload: { ...payload, ...patch }, payload_bytes: bytes }] };
    if (sql.includes("rule-definition-applicability")) return { rows: [{ account_exists: true, applicable: true }] };
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { query, release, connect, repository: new RuleDefinitionRepository({ connect } as unknown as Pool) };
}
describe("RuleDefinitionRepository unit", () => {
  it("invalid auth/target fail before acquiring a connection", async () => {
    const s = setup();
    await expect(s.repository.read({ ...auth, userId: "invalid" }, target)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(s.repository.read(auth, { ...target, ds: "2026-02-31" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(s.connect).not.toHaveBeenCalled();
  });
  it("connection failures do not leak their original message", async () => {
    const s = setup(); s.connect.mockRejectedValueOnce(new Error("synthetic password SQL"));
    await expect(s.repository.read(auth, target)).rejects.toThrow(/^Rule definition read failed: SOURCE_UNAVAILABLE$/);
  });
  it("query errors roll back and remain safe even when rollback fails", async () => {
    const s = setup(); s.query.mockImplementation(async sql => {
      if (sql.includes("rule-definition-row") || sql === "ROLLBACK") throw new Error("synthetic SQL body");
      return { rows: [] };
    });
    await expect(s.repository.read(auth, target)).rejects.toThrow(/^Rule definition read failed: SOURCE_UNAVAILABLE$/);
    expect(s.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK"); expect(s.release).toHaveBeenCalledOnce();
  });
  it("multiple definition rows are rejected rather than taking the first", async () => {
    const s = setup(); s.query.mockImplementation(async sql => sql.includes("rule-definition-row") ?
      { rows: [{ payload, payload_bytes: 500 }, { payload, payload_bytes: 500 }] } : { rows: [] });
    await expect(s.repository.read(auth, target)).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
  });
  it("keeps int64 and scoped parameters, committing a read-only repeatable snapshot", async () => {
    const s = setup(); const result = await s.repository.read(auth, target);
    expect(result).toMatchObject({ target, applicable: true, definition: { id: target.ruleId, workspace_id: workspaceId } });
    expect(s.query.mock.calls[0]?.[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(s.query.mock.calls.at(-1)?.[0]).toBe("COMMIT"); expect(s.release).toHaveBeenCalledOnce();
  });
  it("keeps the parsed tree private across the subsequent applicability await", async () => {
    const s = setup(), driverPayload = structuredClone(payload);
    s.query.mockImplementation(async sql => {
      if (sql.includes("rule-definition-row")) return { rows: [{ payload: driverPayload, payload_bytes: 500 }] };
      if (sql.includes("rule-definition-applicability")) {
        driverPayload.condition_tree.all[0]!.threshold = 999;
        return { rows: [{ account_exists: true, applicable: true }] };
      }
      return { rows: [] };
    });
    expect(await s.repository.read(auth, target)).toMatchObject({ definition: {
      condition_tree: { all: [{ threshold: 20 }] },
    } });
  });
  it.each([{ ...target, media: "TENCENT" }, { ...target, accountId: "other" }])("rejects absent tuple grant before DB %#", async query => {
    const s = setup(); await expect(s.repository.read(auth, query)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.connect).not.toHaveBeenCalled();
  });
  it("empty grants are not discovery permission", async () => {
    const s = setup(); await expect(s.repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, target)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.connect).not.toHaveBeenCalled();
  });
  it.each([{ workspace_id: "33333333-3333-4333-8333-333333333333" }, { id: "4" }, { enabled: "false" },
    { scope: null }, { condition_tree: { version: "v1", all: [] } }, { fallback_copy: "x".repeat(4097) },
  ])("rejects out-of-scope/invalid returned definition %#", async patch => {
    const s = setup(patch); await expect(s.repository.read(auth, target)).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
    expect(s.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK"); expect(s.release).toHaveBeenCalledOnce();
  });
  it.each([16 * 1024 * 1024, 16 * 1024 * 1024 + 1, NaN, -1])("rejects invalid or exact-limit bytes %s", async bytes => {
    const s = setup({}, bytes); await expect(s.repository.read(auth, target)).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
  });
  it("returns a missing rule as null, not a fabricated global default", async () => {
    const s = setup(); s.query.mockImplementation(async () => ({ rows: [] }));
    expect(await s.repository.read(auth, target)).toBeNull(); expect(s.release).toHaveBeenCalledOnce();
  });
  it("does not coerce invalid applicability booleans", async () => {
    const s = setup(); s.query.mockImplementation(async sql => sql.includes("rule-definition-row") ?
      { rows: [{ payload, payload_bytes: 500 }] } : sql.includes("rule-definition-applicability") ?
        { rows: [{ account_exists: "true", applicable: false }] } as never : { rows: [] });
    await expect(s.repository.read(auth, target)).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
  });
  it("keeps a null legacy condition tree explicitly unavailable", async () => {
    expect(await setup({ condition_tree: null }).repository.read(auth, target)).toMatchObject({ definition: { condition_tree: null } });
  });
});
