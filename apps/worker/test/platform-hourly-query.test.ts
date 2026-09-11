import { describe, expect, it, vi } from "vitest";
import { metricValue as mv, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { AccountHourlyReadError } from "@ka/db";
import { PlatformHourlyQuery } from "../src/data/platform-hourly-query.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { validateHourlySource } from "../src/data/hourly-public-source.js";

const ws = "00000000-0000-4000-8000-000000000001", date = "2026-09-09";
const auth: ApprovedWorkspaceAuthContext = { workspaceKind: "personal", workspaceId: ws,
  userId: "00000000-0000-4000-8000-000000000002", role: "optimizer",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a", accessLevel: "read" }] } };
const resolved = (hhFrom = 1, hhTo = 1) => createDataQueryRegistry().resolve("account.hourly", { date, media: "KUAISHOU", hhFrom, hhTo }, "platform");
const row = (hh = 1) => ({ workspaceId: ws, media: "KUAISHOU", accountId: "a", ds: date, hh,
  cost: hh === 0 ? 20 : 80, exposure: 100, click: 10, conversion: 3, realConversion: hh === 0 ? 1 : 2, budget: 100,
  lastSyncTime: "2026-09-08T18:01:00.000Z", sampledAt: "2026-09-08T18:05:00.000Z", complete: true, sourceRunId: "9007199254740993" });
const snapshot = () => ({ workspaceId: ws, date, rows: [row(0), row(1)], coefficient: { id: "1", value: 2, op: "divide", effectiveDate: date } });
const setup = (value: unknown = snapshot(), maxResponseBytes?: number) => {
  const read = vi.fn(async () => value);
  return { read, query: new PlatformHourlyQuery({ read }, maxResponseBytes === undefined ? {} : { maxResponseBytes }) };
};

describe("formal account-hourly source projection", () => {
  it("queries only the reader, retains a predecessor, uses real coefficient and unknown metadata", async () => {
    const { query, read } = setup(); const proof = await query.query(resolved(), auth);
    expect(read).toHaveBeenCalledWith(auth, { date, media: "KUAISHOU", hhFrom: 1, hhTo: 1 });
    const source = validateHourlySource(proof, resolved(), auth);
    expect(source.rows).toHaveLength(1);
    expect(source.rows[0]).toMatchObject({ hh: 1, cumulative: { cost: mv(80), cashCost: mv(40) },
      delta: { cost: mv(60), cashCost: mv(30) }, velocity: { costPerHour: mv(60) },
      projectedDayCost: mv(null), lastSyncAt: row().lastSyncTime });
    expect(source.lineage).toMatchObject({ dataAsOf: row().lastSyncTime, datasetVersion: null, timezone: null,
      dayCut: null, metadataAvailability: "partial", partial: false, truncated: false,
      coverage: { complete: true, requestedObjects: 1, returnedObjects: 1 } });
    expect(source.warnings).toContain("HOURLY_DAY_TIMEZONE_UNKNOWN");
  });
  it("multiply and zero/missing coefficients never use an invented conversion", async () => {
    const value = snapshot(); value.coefficient.op = "multiply";
    expect((await setup(value).query.query(resolved(), auth)).source.rows[0]!.cumulative).toMatchObject({ cashCost: mv(160) });
    const missing = await setup({ ...snapshot(), coefficient: null }).query.query(resolved(), auth);
    expect(missing.source.rows[0]!.cumulative).toMatchObject({ cashCost: mv(null) });
    expect(missing.source.lineage.coverage.complete).toBe(false);
    await expect(setup({ ...snapshot(), coefficient: { ...snapshot().coefficient, value: 0 } }).query.query(resolved(), auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("a missing predecessor leaves delta missing; incomplete hour has no velocity", async () => {
    const value = { ...snapshot(), rows: [{ ...row(), complete: false }] };
    const proof = await setup(value).query.query(resolved(), auth);
    expect(proof.source.rows[0]).toMatchObject({ delta: { cost: mv(null) }, velocity: { costPerHour: mv(null) } });
    expect(proof.source.lineage.coverage.complete).toBe(false);
  });
  it("missing hours and hh24 stay missing and are never replaced by hh23 or zero", async () => {
    const proof = await setup({ ...snapshot(), rows: [row(23)] }).query.query(resolved(24, 24), auth);
    expect(proof.source.rows[0]).toMatchObject({ hh: 24, cumulative: { cost: mv(null) }, lastSyncAt: null });
    expect(proof.source.lineage).toMatchObject({ dataAsOf: null, metadataAvailability: "unknown", partial: true,
      coverage: { complete: false, requestedObjects: 1, returnedObjects: 0 } });
    expect(proof.source.returnedRowCount).toBe(1);
    expect(proof.source.wholeResultTotal).toEqual(mv(null));
  });
  it("empty approved scope never reads and never becomes complete", async () => {
    const { query, read } = setup();
    const proof = await query.query(resolved(), { ...auth, scope: { kind: "explicit_accounts", accounts: [] } });
    expect(read).not.toHaveBeenCalled(); expect(proof.source.rows).toEqual([]);
    expect(proof.source.lineage.coverage).toMatchObject({ complete: false, requestedObjects: 0, returnedObjects: 0 });
  });
  it("team and malformed auth are rejected before reader IO", async () => {
    const { query, read } = setup();
    for (const bad of [null, { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }])
      await expect(query.query(resolved(), bad as ApprovedWorkspaceAuthContext)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).not.toHaveBeenCalled();
  });
  it.each(["workspaceId", "media", "accountId"])("rejects escaped %s", async field => {
    await expect(setup({ ...snapshot(), rows: [{ ...row(), [field]: field === "workspaceId" ? "00000000-0000-4000-8000-000000000099" : "OTHER" }] })
      .query.query(resolved(), auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each([{ cost: "80" }, { sampledAt: "bad" }, { ds: "2026-09-08" }, { hh: 3 }, { realConversion: NaN }])("bad sample %j is invalid", async patch => {
    await expect(setup({ ...snapshot(), rows: [{ ...row(), ...patch }] }).query.query(resolved(), auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("rejects duplicate rows, mismatched snapshot and future/ambiguous coefficient", async () => {
    for (const value of [{ ...snapshot(), rows: [row(), row()] }, { ...snapshot(), date: "2026-09-08" },
      { ...snapshot(), coefficient: { ...snapshot().coefficient, effectiveDate: "2026-09-10" } }])
      await expect(setup(value).query.query(resolved(), auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each(["FORBIDDEN", "SOURCE_TRUNCATED", "UPSTREAM_INVALID_RESPONSE", "SOURCE_UNAVAILABLE", "UPSTREAM_TIMEOUT", "AMBIGUOUS_VERSION"] as const)("translates safe repository error %s", async code => {
    const query = new PlatformHourlyQuery({ read: async () => { throw new AccountHourlyReadError(code); } });
    await expect(query.query(resolved(), auth)).rejects.toMatchObject({ code: code === "AMBIGUOUS_VERSION" ? "UPSTREAM_INVALID_RESPONSE" : code });
  });
  it("unknown reader failures hide messages and plain objects cannot impersonate errors", async () => {
    const query = new PlatformHourlyQuery({ read: async () => { throw { code: "FORBIDDEN", secret: "private" }; } });
    await expect(query.query(resolved(), auth)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", message: "SOURCE_UNAVAILABLE" });
  });
  it("bounds exact encoded bytes and projected cells before reader IO", async () => {
    const proof = await setup().query.query(resolved(), auth), size = Buffer.byteLength(JSON.stringify(proof));
    await expect(setup(snapshot(), size).query.query(resolved(), auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    expect(await setup(snapshot(), size + 1).query.query(resolved(), auth)).toEqual(proof);
    const { query, read } = setup();
    const large = { ...auth, scope: { kind: "explicit_accounts" as const, accounts: Array.from({ length: 401 }, (_, i) => ({ media: "KUAISHOU", accountId: String(i), accessLevel: "read" as const })) } };
    await expect(query.query(resolved(0, 24), large)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects invalid process limits, unregistered query and mixed unfiltered grants", async () => {
    for (const maxResponseBytes of [0, 1.5, 16 * 1024 * 1024 + 1]) expect(() => setup(snapshot(), maxResponseBytes)).toThrow();
    const { query, read } = setup();
    await expect(query.query({ queryId: "account.hourly" } as ReturnType<typeof resolved>, auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    await expect(query.query(resolved(), { ...auth, scope: { kind: "explicit_accounts", accounts: [
      ...auth.scope.accounts, { media: "TENCENT", accountId: "a", accessLevel: "read" },
    ] } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).not.toHaveBeenCalled();
  });
  it("uses oldest actual current source time, never predecessor or sampledAt", async () => {
    const first = { ...row(0), lastSyncTime: "2020-01-01T00:00:00Z" };
    const second = { ...row(1), lastSyncTime: "2026-09-08T18:00:00Z", sourceRunId: null };
    const third = { ...row(2), lastSyncTime: "2026-09-08T19:00:00Z" };
    const proof = await setup({ ...snapshot(), rows: [first, second, third] }).query.query(resolved(1, 2), auth);
    expect(proof.source.lineage.dataAsOf).toBe("2026-09-08T18:00:00.000Z");
  });
  it("missing cost remains missing while actual row identity is counted", async () => {
    const proof = await setup({ ...snapshot(), rows: [{ ...row(), cost: null }] }).query.query(resolved(), auth);
    expect(proof.source.rows[0]!.cumulative).toMatchObject({ cost: mv(null), cashCost: mv(null) });
    expect(proof.source.lineage.coverage).toMatchObject({ returnedObjects: 1, complete: false });
  });
  it("snapshot workspace and huge source envelope cannot bypass safe errors", async () => {
    await expect(setup({ ...snapshot(), workspaceId: "00000000-0000-4000-8000-000000000099" }).query.query(resolved(), auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setup({ ...snapshot(), unexpected: "x".repeat(16 * 1024 * 1024) }).query.query(resolved(), auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
});
