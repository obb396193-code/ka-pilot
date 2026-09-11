// F-OS-006（2026-09-11 内网实测）：ka-data 的 SQL 护栏按关键字黑名单拒 REPLACE（分不清 REPLACE INTO 与字符串函数
// replace()），团队空间所有窗口查询曾因此 503。生成的 SQL 不得出现 replace(；且 dwd_account_daily.ds 实际是 TEXT。
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { createDataQueryRegistry } from "../src/data/query-registry.js";

type GuardedQueryId = "account.summary" | "account.trend" | "reconcile.account_daily";
const scope = [{ media: "KUAISHOU", accountId: "same" }];

function plan(queryId: GuardedQueryId) {
  const registry = createDataQueryRegistry();
  return registry.buildKaDataPlan(
    registry.resolve(queryId, { dateFrom: "2026-08-23", dateTo: "2026-08-24" }, queryId === "reconcile.account_daily" ? "reconcile" : "ka_data"),
    scope,
  );
}

describe("ka-data SQL stays clear of the guard's keyword blacklist", () => {
  it.each(["account.summary", "account.trend", "reconcile.account_daily"] as const)("%s never uses replace()", (queryId) => {
    expect(plan(queryId).sql).not.toMatch(/\breplace\s*\(/i);
  });

  it("joins expected days against a TEXT ds column exactly like production ka-data", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE TABLE dwd_account_daily (
        ds TEXT, media TEXT, account_id TEXT, cost_yuan REAL, show REAL,
        click REAL, conv REAL, cash_yuan REAL, cash_assessment REAL
      )`);
      for (const ds of ["20260823", "20260824"]) {
        db.prepare("INSERT INTO dwd_account_daily VALUES (?, 'KUAISHOU', 'same', 6, 10, 1, 1, 1, 10)").run(ds);
      }
      const rows = db.prepare(plan("account.summary").sql).all() as { real_conversion: number | null }[];
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0]?.real_conversion).toBe(2);
    } finally {
      db.close();
    }
  });
});
