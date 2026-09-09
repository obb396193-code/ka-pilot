import { describe, expect, it } from "vitest";
import type { ChangeSetItemSnapshot, ItemExecutionResult } from "@ka/domain";
import { validateDryRunObservations } from "../src/changeset-observations.js";
const now = new Date("2026-09-09T00:00:00Z"), value = { type: "number" as const, value: 1 };
const draft: ChangeSetItemSnapshot[] = [{ id: 1, targetType: "unit", targetId: "u1", field: "bid", fromValue: value, toValue: value, itemStatus: "pending", failReason: null }];
const results: ItemExecutionResult[] = [{ itemId: 1, status: "success" }];
const snapshot = () => ({ checkedAt: now.toISOString(), dataAsOf: null, items: [{ itemId: "1", targetType: "unit", targetId: "u1", field: "bid",
  fromValue: value, toValue: value, observed: value, verdict: "ok", reason: null }] });
describe("locked dry-run observations", () => {
  it("preserves legacy absence but never accepts explicit null", () => {
    expect(validateDryRunObservations(undefined, draft, results, now)).toBeUndefined();
    expect(() => validateDryRunObservations(null, draft, results, now)).toThrow("Invalid dry-run observations");
  });
  it("clones valid evidence and rejects a future source time", () => {
    const raw = snapshot(), parsed = validateDryRunObservations(raw, draft, results, now);
    raw.items[0]!.targetId = "mutated"; expect(parsed!.items[0]!.targetId).toBe("u1");
    expect(() => validateDryRunObservations({ ...snapshot(), dataAsOf: new Date(now.getTime() + 1).toISOString() }, draft, results, now)).toThrow();
    expect(validateDryRunObservations({ ...snapshot(), dataAsOf: now.toISOString() }, draft, results, now)).toBeDefined();
  });
  it.each(["missing-result", "foreign-id", "target-type", "field", "duplicate", "status", "changed-code", "blocked-code"])("rejects %s mismatch", kind => {
    const raw = snapshot(); let stored = draft, statuses = results;
    if (kind === "missing-result") statuses = [];
    if (kind === "foreign-id") raw.items[0]!.itemId = "2";
    if (kind === "target-type") raw.items[0]!.targetType = "account";
    if (kind === "field") raw.items[0]!.field = "budget";
    if (kind === "duplicate") { raw.items.push(raw.items[0]!); stored = [...draft, { ...draft[0]!, id: 2 }]; }
    if (kind === "status") statuses = [{ itemId: 1, status: "failed", failReason: "PERMISSION_DENIED" }];
    if (kind === "changed-code") { Object.assign(raw.items[0]!, { verdict: "changed", observed: { type: "number", value: 2 }, reason: "changed" }); statuses = [{ itemId: 1, status: "failed", failReason: "PERMISSION_DENIED" }]; }
    if (kind === "blocked-code") { Object.assign(raw.items[0]!, { verdict: "blocked", reason: "blocked" }); statuses = [{ itemId: 1, status: "failed", failReason: "FROM_VALUE_CHANGED" }]; }
    expect(() => validateDryRunObservations(raw, stored, statuses, now)).toThrow("Invalid dry-run observations");
  });
  it.each(["changed", "unknown", "blocked"])("stores matching %s status without upgrading it", verdict => {
    const raw = snapshot(); Object.assign(raw.items[0]!, { verdict, reason: "synthetic", observed: verdict === "unknown" ? null : { type: "number", value: 2 } });
    const result: ItemExecutionResult = { itemId: 1, status: verdict === "unknown" ? "unknown" : "failed",
      failReason: verdict === "changed" ? "FROM_VALUE_CHANGED" : "PERMISSION_DENIED" };
    expect(validateDryRunObservations(raw, draft, [result], now)?.items[0]!.verdict).toBe(verdict);
  });
  it("rejects exact16MiB before parsing arbitrary extra payload", () => {
    const raw = { ...snapshot(), extra: "" };
    raw.extra = "x".repeat(16 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(raw)));
    expect(Buffer.byteLength(JSON.stringify(raw))).toBe(16 * 1024 * 1024);
    expect(() => validateDryRunObservations(raw, draft, results, now)).toThrow("Invalid dry-run observations");
  });
});
