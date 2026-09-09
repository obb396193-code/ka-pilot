import { describe, expect, it, vi } from "vitest";
import type { SemanticReadConnection } from "../src/semantic-read-snapshot.js";
import { AccountDimensionEvidenceRepository } from "../src/account-dimension-evidence-repository.js";

// Synthetic identities and parse facts only.
const workspaceId = "00000000-0000-4000-8000-000000000024";
const account = { media: "KUAISHOU", accountId: "synthetic-id" };
const scope = { workspaceId, accounts: [account] };
const base = () => ({ workspace_id: workspaceId, media: account.media, account_id: account.accountId,
  parse_account_id: account.accountId, rule_version: 1, status: "partial", oversized: false,
  segments: { agent: { key: "agent", value: "自投", mapsTo: "agent_type", taskIds: [] } },
  override: { agent: "代投" }, conflicts: null, parsed_at: new Date("2026-09-09T00:00:00Z"), name_matches: true });
function mock(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { query, reader: new AccountDimensionEvidenceRepository({ query } as unknown as SemanticReadConnection) };
}
describe("bounded dimension provenance read", () => {
  it("keeps raw nickname, manual override and unknown provenance separate", async () => {
    const { reader, query } = mock([base()]);
    const result = await reader.load(scope);
    expect(result[0]).toMatchObject({ workspaceId, ...account, parse: {
      status: "partial", segments: base().segments, override: { agent: "代投" }, conflicts: null,
      nameMatches: true, parsedAt: "2026-09-09T00:00:00.000Z",
    } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual([workspaceId, JSON.stringify([account])]);
  });
  it("empty approved tuples query nothing; missing account is not synthesized", async () => {
    const { reader, query } = mock([]);
    expect(await reader.load({ workspaceId, accounts: [] })).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(await reader.load(scope)).toEqual([]);
  });
  it.each([
    { ...scope, workspaceId: "bad" }, { ...scope, accounts: [account, account] },
    { ...scope, accounts: [{ ...account, media: "KUAISHOU';--" }] }, { ...scope, extra: true },
    { ...scope, accounts: [{ ...account, userId: "forged" }] },
    { ...scope, accounts: Array.from({ length: 1001 }, (_, i) => ({ ...account, accountId: `a${i}` })) },
  ])("rejects unbounded/invalid scope before SQL", async input => {
    const { reader, query } = mock([]);
    await expect(reader.load(input)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    { workspace_id: "00000000-0000-4000-8000-000000000025" }, { media: "TENCENT" },
    { account_id: "foreign" }, { parse_account_id: "foreign" }, { segments: [] },
    { segments: { agent: { ...base().segments.agent, key: "wrong" } } },
    { segments: { agent: { ...base().segments.agent, value: 42 } } },
    { segments: { agent: { ...base().segments.agent, taskIds: "not-an-array" } } },
    { segments: { agent: { ...base().segments.agent, extra: "bad" } } },
    { override: [] }, { override: { agent: null } }, { conflicts: "bad" },
    { status: "invalid" }, { rule_version: 0 }, { name_matches: "false" },
    { parsed_at: new Date("invalid") }, { parsed_at: "2026-02-31" }, { oversized: undefined },
    { parse_account_id: null },
  ])("rejects malformed/foreign evidence, not source:null", async change => {
    await expect(mock([{ ...base(), ...change }]).reader.load(scope)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("missing parse is null; conflict and stale parse remain observable", async () => {
    const empty = { ...base(), parse_account_id: null, rule_version: null, status: null, segments: null,
      override: null, conflicts: null, parsed_at: null, name_matches: null };
    expect((await mock([empty]).reader.load(scope))[0]?.parse).toBeNull();
    const conflict = { field: "agent_type", fromNickname: "自投", fromPlatform: "代投", source: "platform" };
    expect((await mock([{ ...base(), status: "conflict", conflicts: [conflict], parsed_at: null, name_matches: false }]).reader.load(scope))[0]?.parse)
      .toMatchObject({ status: "conflict", conflicts: [conflict], parsedAt: null, nameMatches: false });
  });
  it("rejects duplicate rows and SQL byte sentinel without returning a partial list", async () => {
    await expect(mock([base(), base()]).reader.load(scope)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    await expect(mock([{ ...base(), oversized: true }]).reader.load(scope)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    await expect(mock(Array.from({ length: 1001 }, base)).reader.load(scope)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it("rejects exact16MiB transport and honors a 1000-row complete tuple result", async () => {
    const row = { ...base(), padding: "" };
    row.padding = "x".repeat(16 * 1024 * 1024 - Buffer.byteLength(JSON.stringify([row])));
    expect(Buffer.byteLength(JSON.stringify([row]))).toBe(16 * 1024 * 1024);
    await expect(mock([row]).reader.load(scope)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    const accounts = Array.from({ length: 1000 }, (_, i) => ({ ...account, accountId: `a${i}` }));
    const rows = accounts.map(a => ({ ...base(), account_id: a.accountId, parse_account_id: a.accountId }));
    expect(await mock(rows).reader.load({ workspaceId, accounts })).toHaveLength(1000);
  });
  it("duplicate same-scope rows cannot hide behind a larger approved scope", async () => {
    await expect(mock([base(), base()]).reader.load({ workspaceId, accounts: [account, { ...account, accountId: "second" }] }))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
