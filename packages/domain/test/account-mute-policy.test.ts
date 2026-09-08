import { describe, expect, it } from "vitest";
import { accountMuteDeadline, accountMuteIsActive, accountMuteRequestSchema } from "../src/account-mute-policy.js";

describe("P096 account mute business-day policy", () => {
  it.each([
    ["2026-09-08T02:59:59+08:00", 1, "2026-09-08"],
    ["2026-09-08T03:00:00+08:00", 1, "2026-09-09"],
    ["2026-12-31T10:00:00+08:00", 3, "2027-01-03"],
    ["2028-02-28T10:00:00+08:00", 1, "2028-02-29"],
    ["2028-02-28T10:00:00+08:00", 7, "2028-03-06"],
  ])("converts %s + %s to stored date %s and Shanghai03 instant", (now, days, storedDate) => {
    expect(accountMuteDeadline(days, new Date(now))).toEqual({ storedDate, mutedUntil: `${storedDate}T03:00:00+08:00`, scope: "notifications_and_p1p2" });
  });
  it.each([0, 2, 4, 8, -1, 1.5, "1", null, undefined, NaN, Infinity])("rejects days %s", days => {
    expect(() => accountMuteDeadline(days, new Date())).toThrow();
  });
  it("does not accept invalid clock or browser supplied expiry/scope", () => {
    expect(() => accountMuteDeadline(1, new Date("bad"))).toThrow();
    expect(accountMuteRequestSchema.safeParse({ days: 1, reason_chip: "known", mutedUntil: "2099-01-01" }).success).toBe(false);
    expect(accountMuteRequestSchema.safeParse({ days: 1, reason_chip: "known", scope: "all" }).success).toBe(false);
    expect(accountMuteRequestSchema.parse({ days: 3, reason_chip: "known" })).toEqual({ days: 3, reason_chip: "known" });
  });
  it.each(["P1", "P2", "opportunity"] as const)("%s suppressed until and including the cutoff, but not one ms later", severity => {
    expect(accountMuteIsActive("2026-09-08", severity, new Date("2026-09-08T03:00:00+08:00"))).toBe(true);
    expect(accountMuteIsActive("2026-09-08", severity, new Date("2026-09-08T03:00:00.001+08:00"))).toBe(false);
  });
  it("P0 breaks silence, missing mute does not suppress, malformed stored date fails closed", () => {
    const now = new Date("2026-09-08T01:00:00+08:00");
    expect(accountMuteIsActive("2026-09-08", "P0", now)).toBe(false);
    expect(accountMuteIsActive(null, "P1", now)).toBe(false);
    expect(() => accountMuteIsActive("2026-02-31", "P1", now)).toThrow();
    expect(() => accountMuteIsActive("2026-09-08", "invented", now)).toThrow();
  });
});
