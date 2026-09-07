import { describe, expect, it } from "vitest";
import { verifyCurrentValues, buildReverseItems, type ChangeSetItemSnapshot, type CurrentValueSnapshot } from "../src/changesets.js";
import { changeSetDetailItemSchema } from "../src/read-detail-contract.js";

const item = { id: 1, targetType: "unit", targetId: "synthetic", field: "bid", fromValue: { type: "json", value: { a: 1, b: 2 } }, toValue: { type: "number", value: 2 }, itemStatus: "success", failReason: null };
const items = () => [item] as unknown as ChangeSetItemSnapshot[];
const current = (value: unknown) => [{ targetType: "unit", targetId: "synthetic", field: "bid", value }] as CurrentValueSnapshot[];

describe("typed changeset existing flow", () => {
  it("compares structural values instead of object identity", () => {
    expect(verifyCurrentValues(items(), current({ type: "json", value: { b: 2, a: 1 } }))).toEqual({ ok: true, conflicts: [] });
  });
  it("keeps type changes and missing observations distinct", () => {
    expect(verifyCurrentValues(items(), current({ type: "string", value: "1" }))).toMatchObject({ ok: false, conflicts: [{ kind: "changed" }] });
    expect(verifyCurrentValues(items(), [])).toMatchObject({ ok: false, conflicts: [{ kind: "missing", actual: null }] });
  });
  it("rejects ambiguous duplicates instead of accepting last observation", () => {
    const observed = current(item.fromValue);
    expect(() => verifyCurrentValues(items(), [...observed, ...observed])).toThrow();
    expect(() => verifyCurrentValues([...items(), ...items()], observed)).toThrow();
  });
  it("rejects legacy or invalid values instead of comparing them as equal", () => {
    for (const fromValue of ["1", null, { type: "number", value: "1" }, { type: "number", value: NaN }]) {
      expect(() => verifyCurrentValues([{ ...item, fromValue }] as unknown as ChangeSetItemSnapshot[], current(fromValue))).toThrow();
    }
  });
  it("uses typed values in reverse drafts and the existing detail boundary", () => {
    expect(buildReverseItems(items())).toEqual([{ targetType: item.targetType, targetId: item.targetId, field: item.field, fromValue: item.toValue, toValue: item.fromValue }]);
    expect(changeSetDetailItemSchema.safeParse(item).success).toBe(true);
    expect(changeSetDetailItemSchema.safeParse({ ...item, fromValue: "1" }).success).toBe(false);
  });
});
