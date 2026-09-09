import { describe, expect, it } from "vitest";
import { workItemCommandSchema } from "../src/work-item-command.js";
const workItemId = "00000000-0000-4000-8000-000000000001";
describe("internal authorized work-item command", () => {
  it.each([
    { workItemId, action: "start_processing" },
    { workItemId, action: "ignore", reason: "合成忽略原因" },
    { workItemId, action: "ignore" },
    { workItemId, action: "reject", reason: "合成拒绝原因" },
  ])("accepts explicit local action %#", command => expect(workItemCommandSchema.safeParse(command).success).toBe(true));
  it.each([
    { workItemId, action: "reject" }, { workItemId, action: "reject", reason: "  " },
    { workItemId, action: "start_processing", reason: "unused" },
    { workItemId, action: "ignore", workspaceId: workItemId },
    { workItemId, action: "ignore", media: "KUAISHOU" },
    { workItemId, action: "ignore", mute_days: 1 },
    { workItemId, action: "ignore", reason: "x".repeat(4097) },
    { workItemId: "bad", action: "ignore" },
    ...["dispatch", "escalate", "complete", "execute"].map(action => ({ workItemId, action })),
  ])("rejects malformed or out-of-scope commands %#", command => expect(workItemCommandSchema.safeParse(command).success).toBe(false));
});
