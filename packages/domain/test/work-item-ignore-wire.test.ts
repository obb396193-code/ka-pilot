import { describe, expect, it } from "vitest";
import { workItemIgnoreRequestSchema, workItemIgnoreResultSchema, workItemIgnoreMuteResultSchema } from "../src/work-item-ignore-wire.js";

const plain = { workItemId: "00000000-0000-4000-8000-000000000001", status: "ignored", ignoredAt: "2026-09-13T00:00:00Z" };
const muted = { ...plain, mutedUntil: "2026-09-14T03:00:00+08:00", scope: "notifications_and_p1p2" };
describe("P194 ignore request-selected wire", () => {
  it("accepts empty plain request, optional reason, and only frozen mute days", () => {
    for (const value of [{}, { reason_chip: "" }, { reason_chip: "known", mute_days: 3 }]) expect(workItemIgnoreRequestSchema.safeParse(value).success).toBe(true);
    for (const value of [{ mute_days: 2 }, { mute_days: null }, { reason_chip: 4 }, { scope: "*" }]) expect(workItemIgnoreRequestSchema.safeParse(value).success).toBe(false);
  });
  it("plain and muted shapes are deliberately disjoint", () => {
    expect(workItemIgnoreResultSchema.parse(plain)).toEqual(plain);
    expect(workItemIgnoreMuteResultSchema.parse(muted)).toEqual(muted);
    expect(workItemIgnoreResultSchema.safeParse(muted).success).toBe(false);
    expect(workItemIgnoreMuteResultSchema.safeParse(plain).success).toBe(false);
  });
  it.each([{ workItemId: "wrong" }, { status: "open" }, { ignoredAt: "2026-02-31T00:00:00Z" }, { reasonChip: null }, { workspaceId: "spoof" }])("rejects invalid plain result %j", patch => {
    expect(workItemIgnoreResultSchema.safeParse({ ...plain, ...patch }).success).toBe(false);
  });
  it.each([{ mutedUntil: "2026-02-31T00:00:00Z" }, { scope: "all" }])("rejects invalid mute result %j", patch => {
    expect(workItemIgnoreMuteResultSchema.safeParse({ ...muted, ...patch }).success).toBe(false);
  });
});
