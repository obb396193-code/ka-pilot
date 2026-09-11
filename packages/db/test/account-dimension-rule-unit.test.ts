import { describe, expect, it, vi } from "vitest";
import { AccountDimensionRuleRepository } from "../src/account-dimension-rule-repository.js";
const workspaceId = "00000000-0000-4000-8000-000000000041";
const scope = { workspaceId, accounts: [{ media: "KUAISHOU", accountId: "a" }] };
const row = () => ({ workspace_id: workspaceId, media: "KUAISHOU", account_id: "a", rule_version: 1, matched_version: 1,
  invalid: false, oversized: false, mappings: [{ key: "owner", mapsTo: "optimizer", pending: false }] });
function setup(rows: unknown = [row()]) {
  const query = vi.fn(async () => ({ rows }));
  return { query, reader: new AccountDimensionRuleRepository({ query } as never) };
}
describe("historical naming reader trust and bounds", () => {
  it("parameterizes trusted tuple scope; absent historical rule is explicit, empty scope no IO", async () => {
    const { reader, query } = setup(); expect(await reader.load(scope)).toHaveLength(1);
    expect(query.mock.calls[0]).toEqual([expect.stringContaining("n.version=p.rule_version"), [workspaceId, JSON.stringify(scope.accounts)]]);
    query.mockClear(); expect(await reader.load({ ...scope, accounts: [] })).toEqual([]); expect(query).not.toHaveBeenCalled();
    expect(await setup([{ ...row(), rule_version: null, matched_version: null, mappings: null }]).reader.load(scope)).toEqual([
      { workspaceId, ...scope.accounts[0], ruleVersion: null, mappings: null },
    ]);
  });
  it.each([null, {}, { ...scope, accounts: [scope.accounts[0], scope.accounts[0]] },
    { ...scope, workspaceId: "spoof" }, { ...scope, accounts: [{ media: "KUAISHOU", accountId: "a", permission: "read" }] }])("invalid scope before SQL: %j", async input => {
    const { reader, query } = setup(); await expect(reader.load(input)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(query).not.toHaveBeenCalled();
  });
  it.each([null, {}, [null], [{ ...row(), invalid: true }], [{ ...row(), oversized: null }],
    [{ ...row(), workspace_id: "00000000-0000-4000-8000-000000000042" }], [{ ...row(), media: "TENCENT" }],
    [{ ...row(), matched_version: 2 }], [{ ...row(), matched_version: null }], [{ ...row(), mappings: null }],
    [{ ...row(), rule_version: "1" }], [{ ...row(), mappings: [{ key: "owner", mapsTo: "optimizer", pending: "false" }] }],
    [row(), row()]])("malicious result is a typed invalid response: %j", async rows => {
    await expect(setup(rows).reader.load(scope)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("fails closed on upstream byte sentinel, 1001 rows, and oversized transport", async () => {
    for (const rows of [[{ ...row(), oversized: true }], Array(1001).fill(row()), [{ ...row(), extra: "x".repeat(16 * 1024 * 1024) }]]) {
      await expect(setup(rows).reader.load(scope)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    }
  });
  it("does not expose DB failure contents as a contract error", async () => {
    const error = new Error("synthetic connection failure"), reader = new AccountDimensionRuleRepository({ query: vi.fn().mockRejectedValue(error) });
    await expect(reader.load(scope)).rejects.toBe(error);
  });
});
