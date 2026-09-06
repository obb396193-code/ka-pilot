// Synthetic transport fixtures execute the actual single SQL produced by the
// client. Never use this in runtime or as a replacement for a real upstream test.
import { DatabaseSync } from "node:sqlite";

export function windowFixtureRows(sql: string, members: Record<string, unknown>[]) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE dwd_account_daily(ds INTEGER,media TEXT,account_id TEXT,cost_yuan REAL,
      cash_yuan REAL,show REAL,click REAL,conv REAL,cash_assessment REAL)`);
    const insert = db.prepare("INSERT INTO dwd_account_daily VALUES(?,?,?,?,?,?,?,?,?)");
    for (const row of members) {
      if (row.observed === 0) continue;
      const values = [Number(String(row.ds).replaceAll("-", "")), row.media, row.account_id,
        row.cost_yuan, row.cash_yuan, row.show, row.click, row.conv, row.cash_assessment].map((value) => {
        if (value === null || typeof value === "number" || typeof value === "string") return value;
        throw new Error("Invalid synthetic fixture scalar");
      });
      insert.run(...values);
    }
    return db.prepare(sql).all();
  } finally { db.close(); }
}
