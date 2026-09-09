import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../../migrations/015_contract_v1_5.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}
const normalize = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

const contract = readFileSync(new URL("../../../contract/schema.sql", import.meta.url), "utf8");
function frozenBlock(from: string, to: string): string[] {
  const start = contract.indexOf(from);
  const end = contract.indexOf(to);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return normalize(contract.slice(start, end)).split(";").map((s) => s.trim()).filter(Boolean);
}

// 015 = v1.5 + v1.5.1 + v1.7.1 identity_preferences. schema.sql 是唯一权威，逐句比对，不允许 be2 自行设计 DDL。
const FROZEN = [
  ...frozenBlock("-- v1.5 新增", "-- 12.8 缺数期规则抑制"),
  ...frozenBlock("-- v1.5.1 新增", "-- ③ 工作流节点模型"),
  ...frozenBlock("-- v1.7.1（2026-09-06；fe F-006-Q2）用户偏好", "-- ===== v1.7.5"),
];

const NEW_TABLES = [
  "external_changes", "account_transfers", "user_watchlists", "saved_views", "exports",
  "capabilities", "decision_policies", "report_runs", "changeset_groups",
  "task_readiness_overrides", "identity_preferences",
];

describe("015 frozen DDL package (not PostgreSQL SQL execution)", () => {
  it("contains exactly one 015 and every frozen v1.5 / v1.5.1 / v1.7.1 statement", () => {
    expect(readdirSync(new URL("../../migrations", import.meta.url)).filter((name) => name.startsWith("015_")))
      .toEqual(["015_contract_v1_5.cjs"]);
    expect(FROZEN.length).toBeGreaterThan(20);
    for (const statement of FROZEN) expect(normalize(sqlFor("up"))).toContain(statement);
  });

  it("creates all eleven new tables and no table owned by another batch", () => {
    const sql = sqlFor("up");
    for (const table of NEW_TABLES) expect(sql).toContain(`CREATE TABLE ${table}`);
    // 013=R-011 / 014=R-012 / 016=R-015 / 017=R-016 的表一律不许出现在 015。
    expect(sql).not.toMatch(
      /CREATE TABLE (team_sync_runs|team_sync_pages|team_metric_staging|team_snapshot_heads|team_sync_state|task_budget_history|work_item_sla_events|changeset_reversals|changeset_reversal_items|execution_run_items|account_tests|replications|strategies|intel_materials|shadow_decisions|ai_impact_config)/,
    );
  });

  it("adds only be2-owned columns to the three shared tables", () => {
    const sql = normalize(sqlFor("up"));
    for (const column of ["pool_status", "pool_status_source", "pool_status_overridden_by", "pool_status_changed_at", "product_name", "product_ref"]) {
      expect(sql).toContain(`ALTER TABLE accounts ADD COLUMN ${column}`);
    }
    for (const column of ["stage", "stage_source", "stage_changed_at", "sop_run_id"]) {
      expect(sql).toContain(`ALTER TABLE tasks ADD COLUMN ${column}`);
    }
    expect(sql).toContain("ALTER TABLE workflow_runs ADD COLUMN task_id TEXT");
    // work_items 是 be 的（013 加 dispatched/superseded_by/SLA），be2 只读不写。
    expect(sql).not.toContain("ALTER TABLE work_items");
    expect(sql).not.toContain("ALTER TABLE account_metrics_daily");
  });

  it("does not repeat the alert_rules columns that migration 012 already landed", () => {
    const sql = normalize(sqlFor("up"));
    expect(sql).not.toContain("ALTER TABLE alert_rules ADD COLUMN availability_policy");
    expect(sql).not.toContain("ALTER TABLE alert_rules ADD COLUMN data_freshness_max_hours");
  });

  it("never deletes or rewrites existing rows", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
    }
  });

  it("refuses a lossy downgrade before dropping anything, without CASCADE", () => {
    const sql = sqlFor("down");
    for (const table of NEW_TABLES) {
      expect(sql).toContain(`${table} still holds rows; cannot downgrade losslessly`);
      expect(sql.indexOf(`${table} still holds rows`)).toBeLessThan(sql.indexOf("DROP TABLE"));
    }
    for (const guard of [
      "accounts carries manual pool_status overrides; cannot downgrade losslessly",
      "tasks carries manual or workflow stage sources; cannot downgrade losslessly",
      "changesets are linked to changeset groups; cannot downgrade losslessly",
      "workflow_runs are linked to tasks; cannot downgrade losslessly",
      "report_configs carries shared or versioned rows; cannot downgrade losslessly",
    ]) {
      expect(sql).toContain(guard);
      expect(sql.indexOf(guard)).toBeLessThan(sql.indexOf("ALTER TABLE"));
    }
    expect(sql).not.toMatch(/DROP[^;]*CASCADE/);
  });

  it("reverses every table and column it creates", () => {
    const down = normalize(sqlFor("down"));
    for (const table of NEW_TABLES) expect(down).toContain(`DROP TABLE ${table}`);
    expect(down).toContain("ALTER TABLE changesets DROP COLUMN group_id");
    expect(down).toContain("ALTER TABLE workflow_runs DROP COLUMN task_id");
    for (const column of ["stage", "stage_source", "stage_changed_at", "sop_run_id"]) {
      expect(down).toContain(`DROP COLUMN ${column}`);
    }
    for (const column of ["is_shared", "version", "updated_at"]) {
      expect(down).toContain(`DROP COLUMN ${column}`);
    }
  });

  it("uses bounded stopped-worker migration transactions", () => {
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
