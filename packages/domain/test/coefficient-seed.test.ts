import { describe, expect, it } from "vitest";
import { initialCoefficientSeedRows, parseCoefficientSeed } from "../src/coefficient-seed.js";

const workspace_id = "00000000-0000-4000-8000-000000000080";
const input = { workspace_id, effective_date: "2026-08-01" };

describe("explicit initial coefficient seed", () => {
  it("preserves explicit date and space with no defaults", () => {
    expect(parseCoefficientSeed(input)).toEqual(input);
  });
  it("uses the four frozen coefficient directions as decimal strings", () => {
    expect(initialCoefficientSeedRows()).toEqual([
      { media: "KUAISHOU", op: "multiply", coefficient: "0.7812" },
      { media: "TENCENT", op: "divide", coefficient: "1.045" },
      { media: "TOUTIAO", op: "divide", coefficient: "1.09" },
      { media: "BAIDU", op: "divide", coefficient: "1.51" },
    ]);
  });
  it("does not expose a mutable shared seed configuration", () => {
    const first = initialCoefficientSeedRows(); first[0]!.coefficient = "bad";
    expect(initialCoefficientSeedRows()[0]?.coefficient).toBe("0.7812");
  });
  it.each([undefined, null, {}, { workspace_id }, { effective_date: "2026-08-01" }, { ...input, workspace_id: "all" }])("rejects missing or invalid input %j", (value) => {
    expect(() => parseCoefficientSeed(value)).toThrow(/^Invalid coefficient seed$/);
  });
  it.each(["2026-02-29", "2026-02-31", "2026-13-01", "20260801", "today", "", "2026-08-01T00:00:00Z"])("rejects implicit or impossible date %s", (effective_date) => {
    expect(() => parseCoefficientSeed({ ...input, effective_date })).toThrow(/^Invalid coefficient seed$/);
  });
  it("accepts a leap day without guessing its business effective date", () => {
    expect(parseCoefficientSeed({ ...input, effective_date: "2028-02-29" }).effective_date).toBe("2028-02-29");
  });
  it.each(["password", "token", "secret", "coefficient", "op", "changed_by", "kind"])("rejects unapproved extra field %s", (key) => {
    expect(() => parseCoefficientSeed({ ...input, [key]: "private" })).toThrow(/^Invalid coefficient seed$/);
  });
});
