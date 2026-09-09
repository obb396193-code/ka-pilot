import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dataQueryResponseSchema, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { describe, expect, it, vi } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService, createDataQueryHttpHandler } from "../src/data/query-service.js";

const auth: ApprovedWorkspaceAuthContext = { workspaceKind: "personal", workspaceId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002", role: "optimizer", scope: { kind: "explicit_accounts",
    accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "read" }] } };
const params = { date_from: "2026-09-01", date_to: "2026-09-05", media: "KUAISHOU", groupBy: "account" };
describe("Gap fixed Registry and rule-source-off contract", () => {
  it.each(["account", "task", "biz"])("registers %s without an implicit KA SQL/threshold", groupBy => {
    const registry = createDataQueryRegistry();
    const resolved = registry.resolve("account.gap", { ...params, groupBy }, "platform");
    expect(resolved).toMatchObject({ queryId: "account.gap", rowSchemaVersion: "account.gap/v1", maxRows: 10000,
      params: { dateFrom: "2026-09-01", dateTo: "2026-09-05", groupBy } });
    expect(() => registry.buildTeamKaDataPlan(resolved)).toThrow();
  });
  it("valid returns503 after scope, not a fabricated daily/default-threshold result", async () => {
    const query = vi.fn(async () => { throw new Error("must not read legacy daily source"); });
    const handler = createDataQueryHttpHandler(new DataQueryService({ registry: createDataQueryRegistry(), platform: { query }, kaData: { query } }));
    for (const [input, status] of [[params, 503], [{ ...params, accountIds: ["unapproved"] }, 403],
      [{ ...params, threshold: 0.2 }, 400], [{ ...params, ruleSetVersion: "browser-invented" }, 400],
      [{ ...params, groupBy: "media" }, 400], [{ ...params, date_to: "2026-10-31" }, 400]] as const) {
      const result = await handler({ method: "POST", body: { queryId: "account.gap", params: input }, auth, requestId: "gap-source-off" });
      expect(result.status).toBe(status);
      expect(result.body).toMatchObject({ ok: false, error: { requestId: "gap-source-off" } });
      if (status === 503) expect(result.body).toMatchObject({ error: { code: "SOURCE_UNAVAILABLE" } });
    }
    expect(query).not.toHaveBeenCalled();
  });
  it("full-envelope Domain/Web parity for three groups and corrupt metadata", async () => {
    const variants: unknown[] = [], expected: boolean[] = [];
    for (const name of ["gap", "gap-task", "gap-biz"]) {
      const fixture = JSON.parse(await readFile(new URL(`../../../packages/contract/fixtures/data-query/${name}.json`, import.meta.url), "utf8"));
      // Explicit synthetic envelope: no assertion that frozen inconsistent clocks
      // or comment fields are production-valid; do not mutate Contract files.
      const meta = fixture.meta;
      fixture.meta = { requestId: "gap-parity", businessDate: fixture.data.source.lineage.window.to, dataAsOf: fixture.data.source.lineage.dataAsOf,
        workspaceKind: "personal", selectedSource: "platform", ruleSetVersion: meta.ruleSetVersion };
      variants.push(fixture); expected.push(true);
      for (const fault of ["version", "date", "time", "group", "duplicate", "missing"]) {
        const changed = structuredClone(fixture);
        if (fault === "version") changed.meta.ruleSetVersion = "";
        if (fault === "date") changed.meta.businessDate = "2026-02-31";
        if (fault === "time") changed.meta.dataAsOf = null;
        if (fault === "group") delete changed.data.source.groupBy;
        if (fault === "duplicate") { changed.data.source.rows.push(changed.data.source.rows[0]); changed.data.source.returnedRowCount++; }
        if (fault === "missing") { changed.data.source.rows[0].realConversion = { value: null, availability: "missing" }; changed.data.source.rows[0].gapStatus = "normal"; }
        variants.push(changed); expected.push(false);
      }
    }
    expect(variants.map(v => dataQueryResponseSchema.safeParse(v).success)).toEqual(expected);
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
      "const m=await import(process.argv[1]);process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(v=>m.dataQueryResponseSchema.safeParse(v).success)))",
      new URL("../../web/lib/data/contracts.ts", import.meta.url).href, JSON.stringify(variants)], { timeout: 10000 });
    expect(JSON.parse(stdout)).toEqual(expected);
  });
});
