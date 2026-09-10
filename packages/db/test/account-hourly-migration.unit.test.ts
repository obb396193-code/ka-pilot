import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Migration = Record<"up" | "down", (pgm: { sql: (sql: string) => void }) => void>;
function sqlFor(direction: "up" | "down"): string {
  const migration = require("../migrations/025_account_metrics_hourly.cjs") as Migration;
  const statements: string[] = [];
  migration[direction]({ sql: (sql) => { statements.push(sql); } });
  return statements.join("\n");
}
const normalize = (text: string) => text.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const contract = readFileSync(new URL("../../contract/schema.sql", import.meta.url), "utf8");
const start = contract.indexOf("CREATE TABLE account_metrics_hourly (");
const frozen = contract.slice(start, contract.indexOf(";", start) + 1);

describe("025 frozen account hourly migration (SQL shape, not PG execution)", () => {
  it("has one 025 and matches the frozen complete DDL", () => {
    expect(normalize(sqlFor("up"))).toContain(normalize(frozen));
    expect(readdirSync(new URL("../migrations", import.meta.url)).filter((name) => name.startsWith("025_")))
      .toEqual(["025_account_metrics_hourly.cjs"]);
  });
  it("adds the deterministic run pagination index", () => {
    expect(sqlFor("up")).toMatch(/ON etl_runs\s*\(workspace_id, started_at DESC, id DESC\)/);
  });
  it("extends partition maintenance and restores the old function on down", () => {
    for (const table of ["metrics_raw", "account_metrics_daily", "ad_metrics_hourly"]) {
      expect(sqlFor("up")).toContain(`PARTITION OF ${table} `);
      expect(sqlFor("down")).toContain(`PARTITION OF ${table} `);
    }
    expect(sqlFor("up")).toContain("PARTITION OF account_metrics_hourly ");
    expect(sqlFor("down")).not.toContain("PARTITION OF account_metrics_hourly ");
  });
  it("has a lossless downgrade guard before table deletion", () => {
    const sql = sqlFor("down");
    expect(sql).toContain("account_metrics_hourly still holds rows; cannot downgrade losslessly");
    expect(sql.indexOf("still holds rows")).toBeLessThan(sql.indexOf("DROP TABLE"));
    expect(sql).not.toMatch(/DROP[^;]*CASCADE/);
  });
  it("never mutates existing rows and bounds maintenance-window locks", () => {
    for (const direction of ["up", "down"] as const) {
      const sql = sqlFor(direction);
      expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|UPDATE /);
      expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
      expect(sql).toContain("SET LOCAL statement_timeout = '5min'");
    }
  });
});
