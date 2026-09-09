import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { etlRunListResponseSchema, etlRunListDataSchema } from "../src/index.js";

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
    const value = fixture(); value.data.items = [];
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(true);
    const running = fixture().data.items[0]; running.status = "running"; running.finishedAt = null; running.rows = null;
    expect(etlRunListDataSchema.safeParse({ items: [running] }).success).toBe(true);
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
    { status: "done", finishedAt: null }, { status: "running" }, { rows: { raw: null, canonical: 1 } },
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
  it("bounds list size without interpreting the limit as proof of source completeness", () => {
    const row = fixture().data.items[0];
    const items = Array.from({ length: 10_000 }, (_, index) => ({ ...row, runId: String(index + 1) }));
    expect(etlRunListDataSchema.safeParse({ items }).success).toBe(true);
    expect(etlRunListDataSchema.safeParse({ items: [...items, { ...row, runId: "10001" }] }).success).toBe(false);
  });
  it("preserves genuine zero counts and disallows failed-stage text on a successful run", () => {
    const value = fixture(); value.data.items[0].rows = { raw: 0, canonical: 0 };
    expect(etlRunListResponseSchema.parse(value)).toMatchObject({ data: { items: [{ rows: { raw: 0, canonical: 0 } }, {}] } });
    value.data.items[0].failedStage = "raw";
    expect(etlRunListResponseSchema.safeParse(value).success).toBe(false);
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
