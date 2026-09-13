import { describe, expect, it } from "vitest";
import { labelBasisEarliestKnownWarning, pickAccountLabelBasis } from "../src/account-label-basis.js";
import { lineageWarningSchema } from "../src/data-query-contract.js";

/** v1.9.49 ①：改名前一行、改名当天起一行。 */
const history = [
  { effectiveFrom: "2026-09-01", owner: "张三" },
  { effectiveFrom: "2026-09-10", owner: "李四" },
];

describe("v1.9.49 pickAccountLabelBasis", () => {
  it("uses the row in effect on each business day, switching exactly on the rename day", () => {
    expect(pickAccountLabelBasis(history, "2026-09-09")).toEqual({ row: history[0], earliestKnown: false });
    // 生效日当天就归新行——差一天，改名那天的钱就记到了旧人头上。
    expect(pickAccountLabelBasis(history, "2026-09-10")).toEqual({ row: history[1], earliestKnown: false });
    expect(pickAccountLabelBasis(history, "2026-12-31")).toEqual({ row: history[1], earliestKnown: false });
  });

  it("falls back to the earliest row before any history, and says so", () => {
    expect(pickAccountLabelBasis(history, "2026-08-31")).toEqual({ row: history[0], earliestKnown: true });
  });

  it("returns null for an account with no rows rather than inventing a basis", () => {
    expect(pickAccountLabelBasis([], "2026-09-01")).toBeNull();
  });

  it.each([
    [[history[1]!, history[0]!]],
    [[history[0]!, history[0]!]],
    [[{ effectiveFrom: "2026-9-1" }]],
  ])("refuses rows it cannot order safely %#", (rows) => {
    // 乱序时「最后一个 <= 该日」就不是最新那行：宁可当场炸，也不静默选错。
    expect(() => pickAccountLabelBasis(rows, "2026-09-05")).toThrow();
  });

  it("refuses a malformed business day", () => {
    expect(() => pickAccountLabelBasis(history, "2026/09/05")).toThrow();
  });

  it("builds the frozen lineage warning shape", () => {
    const warning = labelBasisEarliestKnownWarning({ media: "KUAISHOU", accountId: "acc-1", businessDate: "2026-08-31" });
    expect(lineageWarningSchema.parse(warning)).toEqual(
      { code: "LABEL_BASIS_EARLIEST_KNOWN", media: "KUAISHOU", accountId: "acc-1", businessDate: "2026-08-31" });
    expect(lineageWarningSchema.safeParse({ ...warning, fields: ["cost"] }).success).toBe(false);
    expect(lineageWarningSchema.safeParse({ ...warning, businessDate: "2026-02-30" }).success).toBe(false);
  });
});
