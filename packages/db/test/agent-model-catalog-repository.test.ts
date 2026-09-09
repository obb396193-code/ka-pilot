import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { AgentModelCatalogRepository } from "../src/agent-model-catalog-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(url.pathname))
  throw new Error("Dedicated local ka_*_test database required");
describe("model catalog actual PostgreSQL (only synthetic owned rows)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const repository = new AgentModelCatalogRepository(pool), provider = `synthetic-${randomUUID()}`;
  const auth = { workspaceId: randomUUID(), userId: randomUUID(), role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query(`INSERT INTO provider_model_capabilities(provider_id,model,protocol,status,tested_at,test_version,error_summary)
      VALUES($1,'model-a','anthropic_messages','verified',now(),'synthetic-v1','synthetic-secret-never-return'),
      ($1,'model-b','anthropic_messages','verified',NULL,NULL,'synthetic-secret-never-return'),
      ($1,'model-c','anthropic_messages','failed',now(),'synthetic-v1','synthetic-secret-never-return')`, [provider]);
  }, 30000);
  afterAll(async () => { try { await pool.query("DELETE FROM provider_model_capabilities WHERE provider_id=$1", [provider]); } finally { await pool.end(); } });
  it("projects only public metadata and conservative evidence status", async () => {
    const result = await repository.list(auth), own = result.items.filter(i => i.provider === provider);
    expect(own).toEqual(["verified", "documented_unverified", "disabled"].map((status, i) => ({ id: `model-${String.fromCharCode(97 + i)}`, label: `model-${String.fromCharCode(97 + i)}`, provider, default: false, status })));
    expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|error_summary|test_version|tested_at/);
    expect(await repository.list({ ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } })).toEqual(result);
  });
  it("rejects invalid source rather than inventing missing/default data", async () => {
    await pool.query("UPDATE provider_model_capabilities SET status='nonsense' WHERE provider_id=$1 AND model='model-a'", [provider]);
    try { await expect(repository.list(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); }
    finally { await pool.query("UPDATE provider_model_capabilities SET status='verified' WHERE provider_id=$1 AND model='model-a'", [provider]); }
  });
  it("large projected source fields are withheld by SQL then rejected", async () => {
    await pool.query("UPDATE provider_model_capabilities SET test_version=repeat('x',16777216) WHERE provider_id=$1 AND model='model-a'", [provider]);
    try { await expect(repository.list(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); }
    finally { await pool.query("UPDATE provider_model_capabilities SET test_version='synthetic-v1' WHERE provider_id=$1 AND model='model-a'", [provider]); }
  });
  it("1001 sentinel cannot become a complete partial catalog", async () => {
    await pool.query(`INSERT INTO provider_model_capabilities(provider_id,model,protocol)
      SELECT $1,'overflow-'||n::text,'anthropic_messages' FROM generate_series(1,1001) n`, [provider]);
    try { await expect(repository.list(auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" }); }
    finally { await pool.query("DELETE FROM provider_model_capabilities WHERE provider_id=$1 AND model LIKE 'overflow-%'", [provider]); }
  });
});
