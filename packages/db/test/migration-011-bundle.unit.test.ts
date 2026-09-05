import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = { up: (pgm: { sql: (sql: string) => void }) => void; down: (pgm: { sql: (sql: string) => void }) => void };
const migration = require("../migrations/011_contract_v1_2_p0.cjs") as Migration;
function sqlFor(direction: "up" | "down"): string {
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}

describe("folded 011 migration package (not a PostgreSQL execution test)", () => {
  it("reserves exactly one migration filename for 011", () => {
    expect(readdirSync(new URL("../migrations", import.meta.url)).filter((name) => name.startsWith("011_")))
      .toEqual(["011_contract_v1_2_p0.cjs"]);
  });
  it.each(["backfill_jobs_status_check", "backfill_jobs_failed_stage_check"])("contains up/down for %s", (constraint) => {
    expect(sqlFor("up")).toContain(`ADD CONSTRAINT ${constraint}`);
    expect(sqlFor("down")).toContain(`DROP CONSTRAINT ${constraint}`);
  });
  it("creates fields before CHECK and removes CHECK before fields", () => {
    const up = sqlFor("up");
    const down = sqlFor("down");
    expect(up.indexOf("ADD CONSTRAINT backfill_jobs_failed_stage_check")).toBeGreaterThan(up.indexOf("ADD COLUMN failed_stage"));
    expect(down.indexOf("DROP CONSTRAINT backfill_jobs_failed_stage_check")).toBeGreaterThan(-1);
    expect(down.indexOf("DROP CONSTRAINT backfill_jobs_failed_stage_check")).toBeLessThan(down.indexOf("DROP COLUMN failed_stage"));
  });
  it("revalidates old done instead of grandfathering raw-only completion", () => {
    expect(sqlFor("up")).toMatch(/UPDATE backfill_jobs SET status = 'running', finished_at = NULL, failed_stage = NULL\s+WHERE status = 'done'/);
    expect(sqlFor("up")).toContain("status IS NULL OR status NOT IN");
  });
  it("keeps existing P0 constraints and maintenance-window timeouts", () => {
    for (const name of ["task_accounts_account_validity_excl", "changesets_workspace_initiator_fk", "changesets_workspace_credential_owner_fk", "changeset_items_account_fk", "workflow_effects"]) {
      expect(sqlFor("up")).toContain(name);
      expect(sqlFor("down")).toContain(name);
    }
    for (const direction of ["up", "down"] as const) {
      expect(sqlFor(direction)).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sqlFor(direction)).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
