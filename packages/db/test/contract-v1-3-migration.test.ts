import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
describe("contract v1.3 migration (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });

  it("round-trips legacy TEXT losslessly and refuses typed JSON/op loss on down", async () => {
    expect(await runMigrations({ databaseUrl, direction: "down", count: 1 })).toHaveLength(1);
    const ws = (await pool.query("INSERT INTO workspaces(name) VALUES($1) RETURNING id", [randomUUID()])).rows[0].id;
    const user = (await pool.query("INSERT INTO users(workspace_id,name) VALUES($1,'synthetic') RETURNING id", [ws])).rows[0].id;
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','legacy')", [ws]);
    const change = (await pool.query(`INSERT INTO changesets(workspace_id,media,account_id,initiator,credential_owner_user_id)
      VALUES($1,'KUAISHOU','legacy',$2,$2) RETURNING id`, [ws, user])).rows[0].id;
    const values = [null, "001", "true", '{"type":"number","value":9}', 'quote"\n中文'];
    for (const value of values) await pool.query(`INSERT INTO changeset_items(changeset_id,workspace_id,media,account_id,target_type,target_id,field,from_value,to_value)
      VALUES($1,$2,'KUAISHOU','legacy','account','legacy','budget',$3,$3)`, [change, ws, value]);
    const rows = async () => (await pool.query("SELECT from_value,to_value FROM changeset_items WHERE changeset_id=$1 ORDER BY id", [change])).rows;
    const expected = values.map((value) => ({ from_value: value, to_value: value }));
    expect(await runMigrations({ databaseUrl, count: 1 })).toHaveLength(1);
    expect(await rows()).toEqual(expected);
    expect((await pool.query("SELECT DISTINCT jsonb_typeof(from_value) AS kind FROM changeset_items WHERE changeset_id=$1 AND from_value IS NOT NULL", [change])).rows)
      .toEqual([{ kind: "string" }]);
    const item = (await pool.query("SELECT id FROM changeset_items WHERE changeset_id=$1 ORDER BY id LIMIT 1", [change])).rows[0].id;
    for (const value of [{ type: "number", value: 9 }, 1, false, null, [1]]) {
      await pool.query("UPDATE changeset_items SET from_value=$2::jsonb WHERE id=$1", [item, JSON.stringify(value)]);
      await expect(runMigrations({ databaseUrl, direction: "down", count: 1 })).rejects.toThrow(/cannot downgrade losslessly/);
      expect((await pool.query("SELECT to_regclass('agent_run_events') AS name")).rows[0].name).toBe("agent_run_events");
    }
    await pool.query("UPDATE changeset_items SET from_value=NULL WHERE id=$1", [item]);
    const coefficient = (await pool.query(`INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date)
      VALUES($1,$2,0.7812,'multiply','2026-09-01') RETURNING id`, [ws, `test-${randomUUID()}`])).rows[0].id;
    await expect(runMigrations({ databaseUrl, direction: "down", count: 1 })).rejects.toThrow(/cannot downgrade semantics/);
    await pool.query("DELETE FROM channel_coefficients WHERE id=$1", [coefficient]);
    expect(await runMigrations({ databaseUrl, direction: "down", count: 1 })).toHaveLength(1);
    expect(await rows()).toEqual(expected);
    expect(await runMigrations({ databaseUrl, count: 1 })).toHaveLength(1);
    expect(await rows()).toEqual(expected);
    await pool.query("DELETE FROM changeset_items WHERE changeset_id=$1", [change]);
    await pool.query("DELETE FROM changesets WHERE id=$1", [change]);
    await pool.query("DELETE FROM accounts WHERE workspace_id=$1", [ws]);
    await pool.query("DELETE FROM users WHERE workspace_id=$1", [ws]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [ws]);
  });

  it.each(["agent_messages", "agent_context_items"])("rejects legacy orphan %s without partial DDL", async (table) => {
    await runMigrations({ databaseUrl, direction: "down", count: 1 });
    // table is a test-local constant, never a request identifier.
    const id = (await pool.query(`INSERT INTO ${table}(session_id) VALUES($1) RETURNING id`, [randomUUID()])).rows[0].id;
    try {
      await expect(runMigrations({ databaseUrl, count: 1 })).rejects.toThrow(`${table} contains orphan sessions`);
      expect((await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema='public' AND table_name='alert_rules' AND column_name='condition_tree'`)).rows[0].n).toBe(0);
    } finally {
      await pool.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      expect(await runMigrations({ databaseUrl, count: 1 })).toHaveLength(1);
    }
  });

  it("enforces tenant/media mute keys, active dedupe, session idempotency, event and credential FKs", async () => {
    const wsA = (await pool.query("INSERT INTO workspaces(name) VALUES($1) RETURNING id", [randomUUID()])).rows[0].id;
    const wsB = (await pool.query("INSERT INTO workspaces(name) VALUES($1) RETURNING id", [randomUUID()])).rows[0].id;
    const userA = (await pool.query("INSERT INTO users(workspace_id,name) VALUES($1,'synthetic') RETURNING id", [wsA])).rows[0].id;
    const userB = (await pool.query("INSERT INTO users(workspace_id,name) VALUES($1,'synthetic') RETURNING id", [wsB])).rows[0].id;
    for (const [ws, media] of [[wsA, "KUAISHOU"], [wsA, "TENCENT"], [wsB, "KUAISHOU"]]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [ws, media]);
      await pool.query("INSERT INTO account_mutes(workspace_id,media,account_id,muted_until) VALUES($1,$2,'same','2026-09-07')", [ws, media]);
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM account_mutes WHERE workspace_id=ANY($1::uuid[])", [[wsA, wsB]])).rows[0].n).toBe(3);
    await expect(pool.query("INSERT INTO account_mutes VALUES($1,'BAIDU','same','2026-09-07',NULL,NULL,now())", [wsA])).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query("INSERT INTO account_mutes VALUES($1,'KUAISHOU','same','2026-09-07',NULL,NULL,now())", [wsA])).rejects.toMatchObject({ code: "23505" });
    const wi = (ws: string, status: string) => pool.query(`INSERT INTO work_items(workspace_id,type,title,dedupe_key,status)
      VALUES($1,'self','synthetic','same-dedupe',$2) RETURNING occurrence_count`, [ws, status]);
    expect((await wi(wsA, "open")).rows[0].occurrence_count).toBe(1);
    for (const status of ["open", "processing", "dispatched"]) await expect(wi(wsA, status)).rejects.toMatchObject({ code: "23505" });
    await wi(wsA, "done"); await wi(wsB, "open");
    const session = async (ws: string, user: string) => (await pool.query("INSERT INTO agent_sessions(workspace_id,user_id) VALUES($1,$2) RETURNING id", [ws, user])).rows[0].id;
    const sA = await session(wsA, userA); const sB = await session(wsB, userB);
    const message = (s: string, seq: number, client: string) => pool.query("INSERT INTO agent_messages(session_id,seq,client_message_id) VALUES($1,$2,$3)", [s, seq, client]);
    await message(sA, 1, "same"); await message(sB, 1, "same");
    await expect(message(sA, 1, "new")).rejects.toMatchObject({ code: "23505" });
    await expect(message(sA, 2, "same")).rejects.toMatchObject({ code: "23505" });
    await expect(message(randomUUID(), 1, "new")).rejects.toMatchObject({ code: "23503" });
    await pool.query("INSERT INTO agent_context_items(session_id) VALUES($1)", [sA]);
    await expect(pool.query("INSERT INTO agent_context_items(session_id) VALUES($1)", [randomUUID()])).rejects.toMatchObject({ code: "23503" });
    const run = (await pool.query("INSERT INTO agent_runs(workspace_id,session_id,status) VALUES($1,$2,'queued') RETURNING id,attempt", [wsA, sA])).rows[0];
    expect(run.attempt).toBe(1);
    await pool.query("INSERT INTO agent_run_events(run_id,seq,kind) VALUES($1,1,'run')", [run.id]);
    await expect(pool.query("INSERT INTO agent_run_events(run_id,seq,kind) VALUES($1,1,'delta')", [run.id])).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query("INSERT INTO agent_run_events(run_id,seq,kind) VALUES($1,1,'run')", [randomUUID()])).rejects.toMatchObject({ code: "23503" });
    await pool.query("INSERT INTO model_provider_credentials(workspace_id,user_id,provider_id,secret_ref) VALUES($1,$2,'synthetic','ref-only')", [wsA, userA]);
    await expect(pool.query("INSERT INTO model_provider_credentials(workspace_id,user_id,provider_id,secret_ref) VALUES($1,$2,'synthetic','ref-only')", [wsA, userB])).rejects.toMatchObject({ code: "23503" });
    const rule = (await pool.query("INSERT INTO alert_rules(workspace_id,name) VALUES($1,'synthetic') RETURNING id,availability_policy,data_freshness_max_hours", [wsA])).rows[0];
    expect(rule.availability_policy).toBe("suppress"); expect(rule.data_freshness_max_hours).toBeNull();
    await expect(pool.query("UPDATE alert_rules SET availability_policy='fill_zero' WHERE id=$1", [rule.id])).rejects.toMatchObject({ code: "23514" });
    await pool.query("DELETE FROM agent_runs WHERE id=$1", [run.id]);
    expect((await pool.query("SELECT count(*)::int AS n FROM agent_run_events WHERE run_id=$1", [run.id])).rows[0].n).toBe(0);
    await pool.query("DELETE FROM agent_sessions WHERE id=ANY($1::uuid[])", [[sA, sB]]);
    expect((await pool.query("SELECT count(*)::int AS n FROM agent_messages WHERE session_id=ANY($1::uuid[])", [[sA, sB]])).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM agent_context_items WHERE session_id=$1", [sA])).rows[0].n).toBe(0);
    for (const table of ["model_provider_credentials", "account_mutes", "work_items", "alert_rules", "accounts", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [[wsA, wsB]]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[wsA, wsB]]);
  });
});
