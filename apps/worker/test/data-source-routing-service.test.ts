import { describe, expect, it, vi } from "vitest";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import type { ResolvedDataQuery } from "../src/data/query-registry.js";
import { readySource, canonicalRow } from "./canonical-query-fixtures.js";
import { personalAuth, teamAuth } from "./business-auth-fixtures.js";

const ids = { workspaceId: "00000000-0000-4000-8000-000000000024", userId: "00000000-0000-4000-8000-000000000001" };
const personal = personalAuth({ ...ids, accounts: [{ media: "KUAISHOU", accountId: "a" }] });
const team = teamAuth(ids);
const request = { queryId: "account.summary", params: { date: "2026-08-24" } };
function setup(kaDataEnabled = true, diagnosticEnabled = false) {
  const kaData = { query: vi.fn(async (resolved: ResolvedDataQuery) => readySource(resolved.queryId, "ka_data", [canonicalRow(resolved.queryId, 10, ids.workspaceId, "a")])) };
  const platform = { query: vi.fn(async (resolved: ResolvedDataQuery) => readySource(resolved.queryId, "canonical", [canonicalRow(resolved.queryId, 11, ids.workspaceId, "a")])) };
  const audit = vi.fn();
  const service = new DataQueryService({ registry: createDataQueryRegistry(), kaData, platform, sourcePolicy: { kaDataEnabled, diagnosticEnabled, entitlements: [ids] }, audit });
  return { service, kaData, platform, audit };
}
describe("workspace source policy wired into DataQueryService", () => {
  it("selects sources from approved workspace kind and logs only bounded route facts", async () => {
    const { service, kaData, platform, audit } = setup();
    expect(await service.execute(request, personal, "route-personal-1")).toMatchObject({ ok: true, data: { mode: "platform" } });
    expect(kaData.query).not.toHaveBeenCalled();
    expect(await service.execute(request, team, "route-team-1")).toMatchObject({ ok: true, data: { mode: "ka_data" } });
    expect(platform.query).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls).toEqual([
      [{ selectedSource: "platform", reason: "personal_workspace", requestId: "route-personal-1" }],
      [{ selectedSource: "ka_data", reason: "team_workspace", requestId: "route-team-1" }],
    ]);
  });
  it("never lets a browser choose a source or reach reconcile via the normal method", async () => {
    const { service, kaData, platform } = setup(true, true);
    expect(await service.execute({ ...request, dataView: "platform" }, personal)).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(await service.execute({ ...request, queryId: "reconcile.account_daily" }, personal)).toMatchObject({ ok: false, error: { code: "QUERY_NOT_ALLOWED" } });
    expect(kaData.query).not.toHaveBeenCalled(); expect(platform.query).not.toHaveBeenCalled();
  });
  it("uses the independent diagnostic method and requires entitlement before either adapter", async () => {
    const denied = setup();
    const input = { ...request, queryId: "reconcile.account_daily" };
    expect(await denied.service.executeReconcile(input, personal)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(denied.kaData.query).not.toHaveBeenCalled(); expect(denied.platform.query).not.toHaveBeenCalled();
    const allowed = setup(true, true);
    expect(await allowed.service.executeReconcile(input, personal)).toMatchObject({ ok: true, data: { mode: "reconcile" } });
  });
  it("keeps personal usable but fails team closed when KA is disabled", async () => {
    const { service, kaData } = setup(false);
    expect(await service.execute(request, team)).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
    expect(await service.execute(request, personal)).toMatchObject({ ok: true, data: { mode: "platform" } });
    expect(kaData.query).not.toHaveBeenCalled();
  });

  it("binds both ordinary and diagnostic lineage to Session rather than adapter claims", async () => {
    const { service, kaData, platform } = setup(true, true);
    for (const [adapter, source] of [[kaData, "ka_data"], [platform, "canonical"]] as const) {
      adapter.query.mockImplementation(async (resolved) => {
        const response = readySource(resolved.queryId, source, [canonicalRow(resolved.queryId, 1, ids.workspaceId, "a")]);
        return { ...response, lineage: { ...response.lineage, workspaceKind: "team" } };
      });
    }
    expect(await service.execute(request, personal)).toMatchObject({
      ok: true, data: { source: { lineage: { workspaceKind: "personal" } } },
    });
    expect(await service.executeReconcile({ ...request, queryId: "reconcile.account_daily" }, personal)).toMatchObject({
      ok: true, data: {
        kaData: { lineage: { workspaceKind: "personal" } },
        platform: { lineage: { workspaceKind: "personal" } },
      },
    });
    // Same upstream claims cannot determine a team Session either.
    platform.query.mockReset();
    kaData.query.mockImplementation(async (resolved) => readySource(
      resolved.queryId, "ka_data", [canonicalRow(resolved.queryId, 1, ids.workspaceId, "a")],
    ));
    expect(await service.execute(request, team)).toMatchObject({
      ok: true, data: { source: { lineage: { workspaceKind: "team", metadataAvailability: "unknown" } } },
    });
  });

  it("preserves authenticated kind when either reconciliation source fails", async () => {
    for (const currentAuth of [personal, team]) {
      const { service, kaData, platform } = setup(true, true);
      kaData.query.mockRejectedValue(new Error("private upstream details"));
      platform.query.mockRejectedValue(new Error("private DB details"));
      const response = await service.executeReconcile(
        { ...request, queryId: "reconcile.account_daily" }, currentAuth,
      );
      expect(response).toMatchObject({
        ok: true, data: {
          kaData: { status: "unavailable", lineage: { workspaceKind: currentAuth.workspaceKind, metadataAvailability: "unknown" } },
          platform: { status: "unavailable", lineage: { workspaceKind: currentAuth.workspaceKind, metadataAvailability: "unknown" } },
        },
      });
      expect(JSON.stringify(response)).not.toContain("private");
    }
  });
});
