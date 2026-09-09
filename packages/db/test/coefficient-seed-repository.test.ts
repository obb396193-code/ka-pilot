import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CoefficientSeedRepository } from "../src/coefficient-seed-repository.js";
import { runMigrations } from "../src/migrate.js";

// Synthetic scoped fixtures. TEST_DATABASE_URL must name an explicitly approved test DB.
describe("coefficient initial seed (real PostgreSQL)", () => {
  let pool: Pool;
  const created: string[] = [];
  const date = "2026-08-01";
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit TEST_DATABASE_URL is required for coefficient seed PG tests");
    const target = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("Dedicated local ka_*_test required");
    pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 3000 });
    await runMigrations({ databaseUrl });
  });
  afterEach(async () => {
    if (!pool || created.length === 0) return;
    await pool.query("DELETE FROM channel_coefficients WHERE workspace_id=ANY($1::uuid[])", [created]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [created]);
    created.length = 0;
  });
  afterAll(async () => { await pool?.end(); });

  async function workspace(kind = "personal", active = true): Promise<string> {
    const id = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name,kind,is_active) VALUES($1,'synthetic coefficient seed',$2,$3)", [id, kind, active]);
    created.push(id);
    return id;
  }
  const seed = (workspace_id: string, effective_date = date) => new CoefficientSeedRepository(pool).seed({ workspace_id, effective_date });
  async function seedBatch<T>(operations: Promise<T>[]): Promise<T[]> {
    // Never begin afterEach while a sibling transaction is still running.
    const outcomes = await Promise.allSettled(operations);
    const failure = outcomes.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return outcomes.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  }
  const rows = async (workspaceId: string) => (await pool.query("SELECT media,coefficient::text,op,effective_date::text,changed_by FROM channel_coefficients WHERE workspace_id=$1 ORDER BY media COLLATE \"C\"", [workspaceId])).rows;

  it("initializes all four exact values and replays without altering rows", async () => {
    const id = await workspace();
    expect(await seed(id)).toEqual({ inserted: 4, skipped: 0 });
    const first = await rows(id);
    expect(first).toEqual([
      { media: "BAIDU", coefficient: "1.51", op: "divide", effective_date: date, changed_by: null },
      { media: "KUAISHOU", coefficient: "0.7812", op: "multiply", effective_date: date, changed_by: null },
      { media: "TENCENT", coefficient: "1.045", op: "divide", effective_date: date, changed_by: null },
      { media: "TOUTIAO", coefficient: "1.09", op: "divide", effective_date: date, changed_by: null },
    ]);
    expect(await seed(id)).toEqual({ inserted: 0, skipped: 4 });
    expect(await rows(id)).toEqual(first);
  });
  it("two concurrent identical seeds produce exactly four rows", async () => {
    const id = await workspace();
    const results = await seedBatch([seed(id), seed(id)]);
    expect(results.reduce((total, result) => total + result.inserted, 0)).toBe(4);
    expect(await rows(id)).toHaveLength(4);
  });
  it("same media across workspaces remains independent", async () => {
    const unrelated = await workspace();
    // Simulate preceding-suite history, including values that would make seed reject.
    await pool.query("INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date) VALUES($1,'KUAISHOU',0.123,'multiply','2026-06-01'),($1,'KUAISHOU',0.456,'divide','2026-07-01')", [unrelated]);
    const untouched = await rows(unrelated);
    const first = await workspace(); const second = await workspace();
    expect(await rows(first)).toEqual([]); expect(await rows(second)).toEqual([]);
    await seedBatch([seed(first), seed(second, "2026-09-01")]);
    expect((await rows(first)).map((row) => row.effective_date)).toEqual(Array(4).fill(date));
    expect((await rows(second)).map((row) => row.effective_date)).toEqual(Array(4).fill("2026-09-01"));
    expect(await rows(unrelated)).toEqual(untouched);
  });
  it("settles successful peers before rejecting a mixed batch so cleanup cannot race them", async () => {
    const id = await workspace();
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; }).then(() => seed(id));
    const rejected = seed(randomUUID());
    const batch = seedBatch([rejected, delayed]);
    let batchSettled = false;
    void batch.then(() => { batchSettled = true; }, () => { batchSettled = true; });
    try {
      await expect(rejected).rejects.toThrow();
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(batchSettled).toBe(false);
      release();
      await expect(batch).rejects.toThrow();
      expect(await rows(id)).toHaveLength(4);
    } finally { release(); await Promise.allSettled([batch, delayed]); }
  });
  it("rejects changed date or duplicate history without modifying existing rows", async () => {
    const id = await workspace(); await seed(id);
    await expect(seed(id, "2026-07-01")).rejects.toThrow(/^Coefficient seed failed$/);
    await pool.query("INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date) VALUES($1,'KUAISHOU',0.8,'multiply','2026-09-01')", [id]);
    const before = await rows(id);
    await expect(seed(id)).rejects.toThrow(/^Coefficient seed failed$/);
    expect(await rows(id)).toEqual(before);
  });
  it("does not approximate distinct NUMERIC values into an idempotent replay", async () => {
    const id = await workspace();
    await pool.query("INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date) VALUES($1,'KUAISHOU',0.78120000000000000001,'multiply',$2)", [id, date]);
    const before = await rows(id);
    await expect(seed(id)).rejects.toThrow();
    expect(await rows(id)).toEqual(before);
  });
  it("requires an existing active personal workspace", async () => {
    const team = await workspace("team"); const inactive = await workspace("personal", false);
    for (const id of [team, inactive, randomUUID()]) {
      await expect(seed(id)).rejects.toThrow(/^Coefficient seed failed$/);
      expect(await rows(id)).toEqual([]);
    }
  });
  it("rolls back earlier inserts if a later database insert fails", async () => {
    const id = await workspace();
    const marker = `seed_test_${randomUUID().replaceAll("-", "")}`;
    // Identifiers are test-generated, never operator data. Trigger only affects this fixture UUID.
    await pool.query(`CREATE FUNCTION ${marker}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.workspace_id='${id}'::uuid AND NEW.media='TENCENT' THEN RAISE EXCEPTION 'synthetic insert failure'; END IF;
      RETURN NEW; END $$`);
    try {
      await pool.query(`CREATE TRIGGER ${marker} BEFORE INSERT ON channel_coefficients FOR EACH ROW EXECUTE FUNCTION ${marker}()`);
      await expect(seed(id)).rejects.toThrow(/^Coefficient seed failed$/);
      expect(await rows(id)).toEqual([]);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${marker} ON channel_coefficients`);
      await pool.query(`DROP FUNCTION ${marker}()`);
    }
  });
});
