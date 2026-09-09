import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { windowSize } from "../migration-window.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";
const MIGRATION_REPLAY_TIMEOUT_MS = 30_000;

const NEW_TABLES = ["kb_documents", "kb_revisions", "kb_links", "kb_business_refs"] as const;

describe("contract v1.4 knowledge base migration 019 (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspace = "";

  const tableExists = async (name: string): Promise<boolean> =>
    (await pool.query("SELECT to_regclass($1) AS name", [`public.${name}`])).rows[0].name !== null;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspace = (await pool.query(
      "INSERT INTO workspaces(name) VALUES($1) RETURNING id", [`kb019-${randomUUID()}`],
    )).rows[0].id;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM kb_business_refs WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM kb_links WHERE workspace_id=$1", [workspace]);
    await pool.query(
      "DELETE FROM kb_revisions WHERE document_id IN (SELECT id FROM kb_documents WHERE workspace_id=$1)", [workspace]);
    await pool.query("DELETE FROM kb_documents WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspace]);
    await pool.end();
  });

  it("creates the four kb tables the endpoints need", async () => {
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
  });

  it("indexes the full-text projection the search endpoint reads", async () => {
    const index = (await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='idx_kb_documents_fts'",
    )).rows[0];
    expect(index?.indexdef).toContain("gin");
    expect(index?.indexdef).toContain("content_text");
  });

  it("keeps revisions, links and refs tied to their document", async () => {
    const first = (await pool.query(
      "INSERT INTO kb_documents(workspace_id,title,kind) VALUES($1,'父文档','manual') RETURNING id", [workspace],
    )).rows[0].id;
    const second = (await pool.query(
      "INSERT INTO kb_documents(workspace_id,title,kind,parent_id) VALUES($1,'子文档','manual',$2) RETURNING id",
      [workspace, first],
    )).rows[0].id;
    await pool.query("INSERT INTO kb_revisions(document_id,revision,content_json) VALUES($1,1,'{}'::jsonb)", [first]);
    await pool.query(
      "INSERT INTO kb_links(workspace_id,source_document_id,target_document_id) VALUES($1,$2,$3)",
      [workspace, first, second]);
    await pool.query(
      "INSERT INTO kb_business_refs(workspace_id,document_id,object_type,object_id) VALUES($1,$2,'task','kb-t1')",
      [workspace, first]);

    // 同一文档同一版本号只能有一条：并发编辑撞号时直接失败，不静默覆盖正文历史。
    await expect(pool.query(
      "INSERT INTO kb_revisions(document_id,revision,content_json) VALUES($1,1,'{}'::jsonb)", [first],
    )).rejects.toThrow(/duplicate key/);
    // 同一 (document, object) 只能记一次反查。
    await expect(pool.query(
      "INSERT INTO kb_business_refs(workspace_id,document_id,object_type,object_id) VALUES($1,$2,'task','kb-t1')",
      [workspace, first],
    )).rejects.toThrow(/duplicate key/);
  });

  it("refuses to drop the tables while a document still exists", async () => {
    await expect(runMigrations({ databaseUrl, direction: "down", count: windowSize("019") }))
      .rejects.toThrow(/kb_documents still holds rows/);
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
  });

  it("replays down/up once nothing depends on the new schema", { timeout: MIGRATION_REPLAY_TIMEOUT_MS }, async () => {
    await pool.query("DELETE FROM kb_business_refs WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM kb_links WHERE workspace_id=$1", [workspace]);
    await pool.query(
      "DELETE FROM kb_revisions WHERE document_id IN (SELECT id FROM kb_documents WHERE workspace_id=$1)", [workspace]);
    await pool.query("DELETE FROM kb_documents WHERE workspace_id=$1", [workspace]);

    // 条数跟着窗口走，不写死：下一条迁移合进来时才不会假红（Q-002 同类）。
    const window = windowSize("019");
    expect(await runMigrations({ databaseUrl, direction: "down", count: window })).toHaveLength(window);
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(false);
    // 018 的东西不受影响：019 回滚不许把上一批一起带走。
    expect(await tableExists("naming_rules")).toBe(true);

    expect(await runMigrations({ databaseUrl, count: window })).toHaveLength(window);
    for (const table of NEW_TABLES) expect(await tableExists(table)).toBe(true);
  });
});
