import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext, DataQueryId } from "@ka/domain";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { canonicalRow, readySource } from "./canonical-query-fixtures.js";

const auth: ApprovedWorkspaceAuthContext = {
  workspaceId: "00000000-0000-4000-8000-000000000024",
  userId: "00000000-0000-4000-8000-000000000001", role: "admin", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "allowed-account", accessLevel: "read" }] },
};
const ids: DataQueryId[] = ["account.summary", "account.trend", "account.table", "account.anomalies", "account.detail", "reconcile.account_daily"];

describe("service is the final v2 truncation boundary", () => {
  for (const queryId of ids) {
    it.each(["over_budget", "source_truncated", "coverage_only", "exact_complete"] as const)(`${queryId}: %s`, async (kind) => {
      const registry = createDataQueryRegistry();
      const resolve = registry.resolve.bind(registry);
      vi.spyOn(registry, "resolve").mockImplementation((...args) => ({ ...resolve(...args), maxRows: 1 }));
      const source = readySource(queryId, "canonical", Array.from({ length: kind === "over_budget" ? 2 : 1 }, () => canonicalRow(queryId, 17)));
      source.lineage.coverage = { complete: true, requestedObjects: 1, returnedObjects: 1 };
      if (kind === "source_truncated" || kind === "coverage_only") {
        source.lineage.partial = true;
        source.lineage.truncated = kind === "source_truncated";
        source.lineage.coverage.complete = false;
        source.wholeResultTotal = { value: null, availability: "partial" };
      }
      const service = new DataQueryService({
        registry, platform: { query: async () => source }, kaData: { query: async () => ({ ...source, lineage: { ...source.lineage, source: "ka_data" } }) },
        sourcePolicy: { kaDataEnabled: true, diagnosticEnabled: true, entitlements: [{ workspaceId: auth.workspaceId, userId: auth.userId }] },
      });
      const input = { queryId, params: { date: "2026-08-24", ...(queryId === "account.detail" ? { accountId: "allowed-account" } : {}) } };
      const response = queryId === "reconcile.account_daily" ? await service.executeReconcile(input, auth) : await service.execute(input, auth);
      expect(response.ok).toBe(true);
      if (!response.ok) return;
      const results = response.data.mode === "reconcile" ? [response.data.kaData, response.data.platform] : [response.data.source];
      for (const result of results) {
        expect(result.rows).toHaveLength(1);
        const metrics = queryId === "account.trend" ? (result.rows[0]?.metrics as { metrics: Record<string, unknown> }).metrics : result.rows[0]?.metrics as Record<string, unknown>;
        const truncated = kind === "over_budget" || kind === "source_truncated";
        expect(metrics.cost).toEqual(truncated ? { value: null, availability: "error" } : { value: 17, availability: "available" });
        expect((metrics.ratios as { realCpa: unknown }).realCpa).toEqual(truncated ? { value: null, state: "undefined" } : { value: 17, state: "finite" });
        expect(result.lineage.truncated).toBe(truncated);
        if (truncated) expect(result.wholeResultTotal.value).toBeNull();
        if (kind === "over_budget") expect(result.lineage.coverage.returnedObjects).toBeUndefined();
      }
      // Normalizing output must not mutate a reusable source/cache result.
      expect(source.rows).toHaveLength(kind === "over_budget" ? 2 : 1);
    });
  }
  it("validates the full batch before discarding an unauthorized tail", async () => {
    const registry = createDataQueryRegistry();
    const resolve = registry.resolve.bind(registry);
    vi.spyOn(registry, "resolve").mockImplementation((...args) => ({ ...resolve(...args), maxRows: 1 }));
    const source = readySource("account.table", "canonical", [canonicalRow("account.table", 1), canonicalRow("account.table", 2, "00000000-0000-4000-8000-000000000099")]);
    const service = new DataQueryService({ registry, kaData: { query: vi.fn() }, platform: { query: async () => source } });
    expect(await service.execute({ queryId: "account.table", params: { date: "2026-08-24" } }, auth)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
