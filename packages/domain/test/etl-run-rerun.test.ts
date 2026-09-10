import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { etlRunRerunRequestSchema, etlRunRerunResponseSchema } from "../src/etl-run-rerun.js";

function fixture(name: string) {
  const value = JSON.parse(readFileSync(new URL(`../../contract/fixtures/system/${name}.json`, import.meta.url), "utf8"));
  if (value.meta) delete value.meta._note;
  return value;
}
describe("ETL rerun frozen strict response", () => {
  it.each(["etl-run-rerun", "etl-run-rerun-conflict"])("parity with arch %s", name => {
    const value = fixture(name); expect(etlRunRerunResponseSchema.parse(value)).toEqual(value);
  });
  it("accepts only an empty command, never scope/credential overrides", () => {
    expect(etlRunRerunRequestSchema.parse({})).toEqual({});
    for (const value of [null, [], { workspaceId: "other" }, { payload: {} }, { credentialOwnerUserId: "other" }])
      expect(etlRunRerunRequestSchema.safeParse(value).success).toBe(false);
  });
  it.each([1, "01", "0", "-1", "1e3", "9223372036854775808", "00000000-0000-4000-8000-000000000e01"])("rejects malformed run ID %j", id => {
    const value = fixture("etl-run-rerun"); value.data.sourceRunId = id;
    expect(etlRunRerunResponseSchema.safeParse(value).success).toBe(false);
  });
  it("preserves int64 without number coercion", () => {
    const value = fixture("etl-run-rerun"); value.data.sourceRunId = "9223372036854775807";
    expect(etlRunRerunResponseSchema.parse(value)).toEqual(value);
  });
  it("requires conflict details and rejects their use on other codes", () => {
    const value = fixture("etl-run-rerun-conflict");
    delete value.error.details; expect(etlRunRerunResponseSchema.safeParse(value).success).toBe(false);
    const conflict = fixture("etl-run-rerun-conflict"); conflict.error.details.token = "synthetic";
    expect(etlRunRerunResponseSchema.safeParse(conflict).success).toBe(false);
    const invalid = fixture("etl-run-rerun-conflict"); invalid.error.code = "INVALID_STATE";
    expect(etlRunRerunResponseSchema.safeParse(invalid).success).toBe(false);
    delete invalid.error.details; expect(etlRunRerunResponseSchema.safeParse(invalid).success).toBe(true);
  });
});
