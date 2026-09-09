import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { withSemanticReadSnapshot } from "../src/semantic-read-snapshot.js";
import { AccountDimensionEvidenceRepository } from "../src/account-dimension-evidence-repository.js";

// Synthetic fixtures, dedicated be database only; never operates on business data.
describe("account dimension evidence / real PG", () => {
  const workspaceId = randomUUID(), otherWorkspace = randomUUID();
  const tuple = { media: "KUAISHOU", accountId: "synthetic-provenance" };
  const scope = { workspaceId, accounts: [tuple] };
  const segment = (value: string) => ({ agent: { key: "agent", value, mapsTo: "agent_type", taskIds: [] } });
  let pool: Pool;
  const load = (input: unknown = scope) => withSemanticReadSnapshot(pool, connection => new AccountDimensionEvidenceRepository(connection).load(input));
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    const url = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) {
      throw new Error("Dedicated local be test database required");
    }
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl });
    for (const ws of [workspaceId, otherWorkspace]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic provenance')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,$2,$3,'synthetic current name')", [ws, media, tuple.accountId]);
        await pool.query(`INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,segments,override)
          VALUES($1,$2,$3,'synthetic current name',1,'overridden',$4::jsonb,$5::jsonb)`,
        [ws, media, tuple.accountId, JSON.stringify(segment(`${ws}:${media}`)), JSON.stringify({ agent: "人工" })]);
      }
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_name_parses", "accounts", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, otherWorkspace]]);
    }
    await pool.end();
  });
  it("uses all three identity keys, does not overwrite manual or raw nickname values, replay is stable", async () => {
    const rows = await load();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workspaceId, ...tuple, parse: {
      ruleVersion: 1, status: "overridden", segments: segment(`${workspaceId}:KUAISHOU`), override: { agent: "人工" }, nameMatches: true,
    } });
    expect(await load()).toEqual(rows);
    const twoMedia = await load({ workspaceId, accounts: [tuple, { ...tuple, media: "TENCENT" }] });
    expect(twoMedia.map(row => row.parse?.segments.agent?.value)).toEqual([`${workspaceId}:KUAISHOU`, `${workspaceId}:TENCENT`]);
    expect((await load({ ...scope, workspaceId: otherWorkspace }))[0]?.parse?.segments.agent?.value).toBe(`${otherWorkspace}:KUAISHOU`);
    expect(await load({ workspaceId, accounts: [] })).toEqual([]);
  });
  it("keeps an unparsed account; missing accounts are absent, not fabricated", async () => {
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-unparsed')", [workspaceId]);
    expect(await load({ workspaceId, accounts: [{ media: "KUAISHOU", accountId: "synthetic-unparsed" }, { media: "KUAISHOU", accountId: "synthetic-missing" }] }))
      .toEqual([{ workspaceId, media: "KUAISHOU", accountId: "synthetic-unparsed", parse: null }]);
  });
  it("all reads stay on caller's RR/RO snapshot across concurrent parse updates", async () => {
    await withSemanticReadSnapshot(pool, async connection => {
      const reader = new AccountDimensionEvidenceRepository(connection);
      const before = await reader.load(scope);
      await pool.query("UPDATE account_name_parses SET override=$4::jsonb WHERE workspace_id=$1 AND media=$2 AND account_id=$3",
        [workspaceId, tuple.media, tuple.accountId, JSON.stringify({ agent: "并发修正" })]);
      expect(await reader.load(scope)).toEqual(before);
      expect((await connection.query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("on");
    });
    expect((await load())[0]?.parse?.override).toEqual({ agent: "并发修正" });
  });
  it("exposes conflict and stale-name evidence without choosing a winner or a current timestamp", async () => {
    const conflicts = [{ field: "agent_type", fromNickname: "自投", fromPlatform: "代投", source: "platform" }];
    await pool.query(`UPDATE account_name_parses SET status='conflict',conflicts=$4::jsonb,parsed_at=NULL,account_name='synthetic former name'
      WHERE workspace_id=$1 AND media=$2 AND account_id=$3`, [workspaceId, tuple.media, tuple.accountId, JSON.stringify(conflicts)]);
    expect((await load())[0]?.parse).toMatchObject({ status: "conflict", conflicts, parsedAt: null, nameMatches: false });
  });
  it("present-invalid JSON fails; no default source is emitted", async () => {
    await pool.query("UPDATE account_name_parses SET segments='[]'::jsonb WHERE workspace_id=$1 AND media=$2 AND account_id=$3", [workspaceId, tuple.media, tuple.accountId]);
    try { await expect(load()).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); }
    finally {
      await pool.query("UPDATE account_name_parses SET segments=$4::jsonb WHERE workspace_id=$1 AND media=$2 AND account_id=$3", [workspaceId, tuple.media, tuple.accountId, JSON.stringify(segment("修复"))]);
    }
  });
  it("SQL byte sentinel rejects oversized JSON before transport, preserving prior data after the test", async () => {
    await pool.query(`UPDATE account_name_parses SET segments=jsonb_build_object('oversized',repeat('x',16777216))
      WHERE workspace_id=$1 AND media=$2 AND account_id=$3`, [workspaceId, tuple.media, tuple.accountId]);
    try { await expect(load()).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" }); }
    finally {
      await pool.query("UPDATE account_name_parses SET segments=$4::jsonb WHERE workspace_id=$1 AND media=$2 AND account_id=$3", [workspaceId, tuple.media, tuple.accountId, JSON.stringify(segment("修复"))]);
    }
  });
});
