import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminCalendarDataSchema, adminCalendarResponseSchema } from "../src/admin-calendar.js";
const fixture = JSON.parse(readFileSync(new URL("../../contract/fixtures/admin/calendar.json", import.meta.url), "utf8"));
describe("admin calendar canonical read", () => {
  it("accepts the authoritative fixture and honest unknown data time", () => {
    expect(adminCalendarResponseSchema.safeParse(fixture).success).toBe(true);
    expect(adminCalendarResponseSchema.safeParse({ ...fixture, meta: { ...fixture.meta, dataAsOf: null } }).success).toBe(true);
  });
  it("accepts empty list", () => { expect(adminCalendarDataSchema.parse({ items: [] })).toEqual({ items: [] }); });
  it.each([{ id: 9007199254740992 }, { id: 0 }, { id: "1" }, { eventDate: "2026-02-31" }, { eventType: "unknown" }, { affectsBaseline: "false" }, { label: null }, { thresholdProfile: "" }, { secret: "bad" }])("rejects present-invalid %j", patch => {
    expect(adminCalendarDataSchema.safeParse({ items: [{ ...fixture.data.items[0], ...patch }] }).success).toBe(false);
  });
  it("rejects duplicate IDs and incorrect date/ID ordering", () => {
    expect(adminCalendarDataSchema.safeParse({ items: [fixture.data.items[0], fixture.data.items[0]] }).success).toBe(false);
    expect(adminCalendarDataSchema.safeParse({ items: [...fixture.data.items].reverse() }).success).toBe(false);
  });
  it("requires known envelope shape and safe requestId", () => {
    expect(adminCalendarResponseSchema.safeParse({ ...fixture, secret: "bad" }).success).toBe(false);
    expect(adminCalendarResponseSchema.safeParse({ ...fixture, meta: { ...fixture.meta, requestId: "bad\nlog" } }).success).toBe(false);
  });
});
