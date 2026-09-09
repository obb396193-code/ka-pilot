import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { etlRunListResponseSchema, etlRunListDataSchema, etlRunListRequestSchema } from "../src/index.js";

function fixture() {
  const value = JSON.parse(readFileSync(new URL("../../contract/fixtures/system/etl-runs.json", import.meta.url), "utf8"));
  delete value.meta._note;
  return value;
}
describe("frozen ETL attempt list response", () => {
  it("accepts the arch fixture, keeps IDs as text and does not group attempts by job", () => {
    const value = fixture();
    value.data.items[1].jobId = value.data.items[0].jobId;
    value.data.items[1].attempt = 2;
    expect(etlRunListResponseSchema.parse(value)).toEqual(value);
  });
  it("preserves null stage evidence and unknown observation time without synthesizing zero", () => {
    const value = fixture(); value.meta.dataAsOf = null;
    const parsed = etlRunListResponseSchema.parse(value);
    expect(parsed).toMatchObject({ ok: true, data: { items: [{ rows: { raw: 186, canonical: 45 } }, { rows: null }] }, meta: { dataAsOf: null } });
  });
  it("supports empty and running observations without pretending completion", () => {
    const value = fixture(); value.data.items = []; value.data.total = 0;
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(true);
    const running = fixture().data.items[0]; running.status = "running"; running.finishedAt = null; running.rows = null;
    expect(etlRunListDataSchema.safeParse({ items: [running], page: 1, pageSize: 50, total: 1 }).success).toBe(true);
  });
  it.each(["9007199254740992", "9007199254740993", "9223372036854775807"])("retains exact int64 run ID %s", id => {
    const value = fixture(); value.data.items[0].runId = id;
    expect(etlRunListResponseSchema.parse(value)).toMatchObject({ data: { items: [{ runId: id }, {}] } });
  });
  it.each([1, "0", "01", "-1", "1e3", "9223372036854775808"])("rejects malformed/overflow run ID %j", id => {
    const value = fixture(); value.data.items[0].runId = id;
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
  });
  it.each([{ attempt: 0 }, { attempt: null }, { attempt: "1" }, { attempt: 1.2 }, { attempt: Number.MAX_SAFE_INTEGER + 1 },
    { jobId: "not-uuid" }, { status: "partial" }, { status: "queued" }, { jobType: "changeset_execute" },
    { businessDate: "2026-02-31" }, { startedAt: "2026-02-31T00:00:00Z" }, { finishedAt: "2026-01-01T00:00:00Z" },
    { status: "done", finishedAt: null }, { status: "running" },
    { rows: { raw: -1, canonical: 1 } }, { rows: { raw: 1, canonical: Infinity } }, { rows: { raw: 1, canonical: "2" } },
    { error_summary: "private upstream response" }, { token: "private" }])("rejects invalid or unapproved row shape %#", patch => {
    const value = fixture(); Object.assign(value.data.items[0], patch);
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
  });
  it("accepts only the public BATCH_FAILED projection, not private evidence", () => {
    const value = fixture(); const warning = { code: "BATCH_FAILED", resource: "account_realtime", ds: "2026-09-05",
      accountIds: ["synthetic"], fingerprint: "a".repeat(64) };
    value.data.items[0].warnings = [warning];
    expect(etlRunListResponseSchema.parse(value)).toEqual(value);
    value.data.items[0].warnings = [{ ...warning, media: "KUAISHOU", failedAt: "2026-09-05T00:00:00Z" }];
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
    value.data.items[0].warnings = ["Authorization: Bearer private"];
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
  });
  it("rejects duplicate run IDs rather than silently dropping evidence", () => {
    const value = fixture(); value.data.items.push(value.data.items[0]);
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
  });
  it("bounds each page to 200 with consistent total and permits an empty past-end page", () => {
    const row = fixture().data.items[0];
    const items = Array.from({ length: 200 }, (_, index) => ({ ...row, runId: String(index + 1) }));
    expect(etlRunListDataSchema.safeParse({ items, page: 1, pageSize: 200, total: 201 }).success).toBe(true);
    expect(etlRunListDataSchema.safeParse({ items: [...items, { ...row, runId: "201" }], page: 1, pageSize: 200, total: 201 }).success).toBe(false);
    expect(etlRunListDataSchema.safeParse({ items: [], page: 2, pageSize: 50, total: 1 }).success).toBe(true);
    for (const data of [{ items: [], page: 1, pageSize: 50, total: 1 },
      { items: [row], page: 2, pageSize: 50, total: 1 }, { items: [row], page: 1, pageSize: 50, total: 0 },
      { items: [row], page: 1, pageSize: 50, total: 2 }]) {
      expect(etlRunListDataSchema.safeParse(data).success).toBe(false);
    }
  });
  it("accepts the new arch legacy fixture without using mutable job attempts", () => {
    const value = JSON.parse(readFileSync(new URL("../../contract/fixtures/system/etl-runs-page.json", import.meta.url), "utf8"));
    delete value.meta._note;
    expect(etlRunListResponseSchema.parse(value)).toEqual(value);
  });
  it("requires legacy warning exactly when attempt is unknown and permits independent stage nulls", () => {
    const value = fixture(); const row = value.data.items[0];
    row.attempt = null; row.warnings = [{ code: "LEGACY_NO_ATTEMPT" }]; row.rows = { raw: null, canonical: 2 };
    expect(etlRunListResponseSchema.parse(value)).toEqual(value);
    row.rows = { raw: 0, canonical: null }; expect(etlRunListResponseSchema.parse(value)).toEqual(value);
    row.rows = { raw: null, canonical: null }; expect(etlRunListResponseSchema.parse(value)).toEqual(value);
    row.attempt = 1; expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
    row.attempt = null; row.warnings = []; expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
    row.warnings = [{ code: "LEGACY_NO_ATTEMPT", message: "private upstream message" }];
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
  });
  it("defaults strict pagination without coercing hostile inputs or overflowing offset", () => {
    expect(etlRunListRequestSchema.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(etlRunListRequestSchema.parse({ page: 2, pageSize: 200 })).toEqual({ page: 2, pageSize: 200 });
    for (const value of [{ page: 0 }, { pageSize: 201 }, { page: "1" }, { page: 1.2 }, { page: NaN },
      { page: Number.MAX_SAFE_INTEGER, pageSize: 200 }, { workspaceId: "foreign" }, { sort: "sql" }]) {
      expect(etlRunListRequestSchema.safeParse(value).success).toBe(false);
    }
  });
  it("keeps a missing legacy business date only with explicit warning, never accepts invalid dates", () => {
    const value = fixture(); const row = value.data.items[0]; row.businessDate = null;
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
    row.warnings = [{ code: "LEGACY_NO_DATE" }]; expect(etlRunListResponseSchema.parse(value)).toEqual(value);
    row.businessDate = "2026-09-08"; expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
    row.businessDate = "2026-02-31"; expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
  });
  it("preserves genuine zero counts and disallows failed-stage text on a successful run", () => {
    const value = fixture(); value.data.items[0].rows = { raw: 0, canonical: 0 };
    expect(etlRunListResponseSchema.parse(value)).toMatchObject({ data: { items: [{ rows: { raw: 0, canonical: 0 } }, {}] } });
    value.data.items[0].failedStage = "raw";
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
  });
  it("accepts internal stage identifiers but not paths, free text or control characters", () => {
    const value = fixture(); const row = value.data.items[1];
    for (const stage of ["fetch:account_page_1", "aggregate:upsert", "account_offline_2026-09-09"]) {
      row.failedStage = stage; expect(etlRunListResponseSchema.safeParse(value).success).toBe(true);
    }
    for (const stage of ["Authorization: Bearer private", "line\nbreak", "/tmp/private", "x".repeat(65)]) {
      row.failedStage = stage; expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
    }
  });
  it("checks strict meta, real calendar dates and safe requestId", () => {
    for (const patch of [{ requestId: "line\ninjection" }, { businessDate: "2026-02-31" },
      { dataAsOf: "2026-02-31T00:00:00Z" }, { selectedSource: "ka_data" }, { workspaceKind: "shared" }, { rawBody: "private" }]) {
      const value = fixture(); Object.assign(value.meta, patch);
      expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
    }
  });
  it("shares the canonical stable error envelope and requires a correlation ID", () => {
    const value = { ok: false, error: { code: "SOURCE_TRUNCATED", message: "Source result is incomplete", retryable: false, requestId: "etl-run-test" } };
    expect(etlRunListResponseSchema.parse(value)).toEqual(value);
    expect(etlRunListResponseSchema.safeParse({ ...value, error: { ...value.error, requestId: undefined } }).success).toBe(false);
    expect(etlRunListResponseSchema.safeParse({ ...value, data: { items: [] } }).success).toBe(false);
  });
});
