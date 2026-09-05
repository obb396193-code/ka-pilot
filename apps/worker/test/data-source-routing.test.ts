import { describe, expect, it } from "vitest";
import { selectDataSourceRoute } from "../src/data/data-source-routing.js";
import { personalAuth, teamAuth } from "./business-auth-fixtures.js";

const identity = { workspaceId: "00000000-0000-4000-8000-000000000024", userId: "00000000-0000-4000-8000-000000000001" };
const personal = personalAuth({ ...identity, accounts: [] });
const team = teamAuth(identity);
const ordinary = { queryId: "account.summary", params: { date: "2026-09-05" } };
const diagnostic = { queryId: "reconcile.account_daily", params: { date: "2026-09-05" } };
const enabled = { kaDataEnabled: true, diagnosticEnabled: true, entitlements: [identity] };

describe("DATA-ROUTE-001 server policy", () => {
  it("selects platform for personal even when optional KA Data is disabled", () => {
    expect(selectDataSourceRoute("ordinary", ordinary, personal)).toMatchObject({
      selectedSource: "platform", workspaceKind: "personal", reason: "personal_workspace",
    });
  });
  it("selects only KA Data for an approved team, never personal grants", () => {
    expect(selectDataSourceRoute("ordinary", ordinary, team, enabled)).toMatchObject({
      selectedSource: "ka_data", workspaceKind: "team", reason: "team_workspace",
    });
    expect(() => selectDataSourceRoute("ordinary", ordinary, team)).toThrow(expect.objectContaining({ code: "SOURCE_UNAVAILABLE" }));
  });
  it.each(["dataView", "data_view", "workspaceKind", "entitlement", "scope", "sql"])(
    "rejects browser field %s rather than silently normalizing it", (field) => {
      expect(() => selectDataSourceRoute("ordinary", { ...ordinary, [field]: "ka_data" }, personal, enabled))
        .toThrow(expect.objectContaining({ code: "INVALID_REQUEST" }));
    },
  );
  it.each(["optimizer", "operator", "lead", "admin"] as const)("does not infer diagnostic entitlement from %s", (role) => {
    expect(() => selectDataSourceRoute("admin_reconcile", diagnostic, { ...personal, role }, { ...enabled, entitlements: [] }))
      .toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });
  it("requires the diagnostic flag and exact workspace/user tuple, with no same-id broadening", () => {
    for (const policy of [
      { ...enabled, diagnosticEnabled: false },
      { ...enabled, entitlements: [{ ...identity, workspaceId: "00000000-0000-4000-8000-000000000025" }] },
      { ...enabled, entitlements: [{ ...identity, userId: "00000000-0000-4000-8000-000000000002" }] },
    ]) expect(() => selectDataSourceRoute("admin_reconcile", diagnostic, personal, policy))
      .toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => selectDataSourceRoute("admin_reconcile", diagnostic, personal, { ...enabled, kaDataEnabled: false }))
      .toThrow(expect.objectContaining({ code: "VIEW_UNSUPPORTED" }));
  });
  it("keeps reconciliation out of ordinary requests and other queries out of the admin endpoint", () => {
    expect(() => selectDataSourceRoute("ordinary", diagnostic, personal, enabled))
      .toThrow(expect.objectContaining({ code: "QUERY_NOT_ALLOWED" }));
    expect(() => selectDataSourceRoute("admin_reconcile", ordinary, personal, enabled))
      .toThrow(expect.objectContaining({ code: "QUERY_NOT_ALLOWED" }));
    expect(selectDataSourceRoute("admin_reconcile", diagnostic, personal, enabled)).toMatchObject({ selectedSource: "reconcile", reason: "diagnostic_entitlement" });
  });
  it("rejects missing or mismatched approved auth before selecting a source", () => {
    expect(() => selectDataSourceRoute("ordinary", ordinary, null, enabled))
      .toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
    expect(() => selectDataSourceRoute("ordinary", ordinary, { ...team, scope: personal.scope }, enabled))
      .toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });
  it.each([undefined, null, [], {}, { queryId: 1, params: {} }, { queryId: "account.summary", params: [] }])(
    "rejects malformed input %# with a stable sanitized message", (input) => {
      expect(() => selectDataSourceRoute("ordinary", input, personal, enabled))
        .toThrow(expect.objectContaining({ code: "INVALID_REQUEST", message: "Invalid data query request" }));
    },
  );
  it("does not include input, identity or secrets in a rejected route error", () => {
    try {
      selectDataSourceRoute("ordinary", { ...ordinary, sql: "secret-query-text" }, personal, enabled);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_REQUEST", retryable: false });
      expect(JSON.stringify(error)).not.toMatch(/secret-query-text|workspaceId|userId/);
    }
  });
});
