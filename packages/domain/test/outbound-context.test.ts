import { describe, expect, it } from "vitest";
import { outboundDeliveryContextSchema, outboundStaffIdSchema } from "../src/outbound-storage-contract.js";
const valid = { workspaceId: "00000000-0000-4000-8000-000000000001", messageId: "00000000-0000-4000-8000-000000000002",
  workspaceName: "synthetic", businessDate: "2026-09-13", media: null, runId: null, step: null };
describe("private outbound context boundary", () => {
  it("preserves unknown source facts and rejects extra private fields", () => {
    expect(outboundDeliveryContextSchema.parse(valid)).toEqual(valid);
    expect(outboundDeliveryContextSchema.safeParse({ ...valid, error: "private" }).success).toBe(false);
  });
  it.each([{ businessDate: "2026-02-31" }, { media: "https://private" }, { runId: "0" }, { runId: "-1" }, { workspaceName: "" }, { step: "x".repeat(129) }])("rejects malformed metadata %j", patch => {
    expect(outboundDeliveryContextSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it.each(["", "a b", "a\nb", "a\tb", "a\u007fb", "x".repeat(257)])("rejects malformed staff ID %j", id => {
    expect(outboundStaffIdSchema.safeParse(id).success).toBe(false);
  });
  it("accepts bounded opaque staff IDs without guessing a numeric format", () => {
    expect(outboundStaffIdSchema.parse("synthetic-staff_01")).toBe("synthetic-staff_01");
  });
});
