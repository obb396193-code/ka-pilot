import { describe, expect, it } from "vitest";

import {
  analyzeStrategyMatrix,
  MIN_STRATEGY_ACCOUNTS,
  MIN_STRATEGY_COST,
  type StrategyObservation,
} from "../src/strategy-analysis.js";

function observation(overrides: Partial<StrategyObservation> = {}): StrategyObservation {
  return {
    rowKey: "信息流",
    rowLabel: "信息流",
    columnKey: "ocpm",
    columnLabel: "oCPM",
    accountId: "account-1",
    cost: 40,
    realConversion: 2,
    ...overrides,
  };
}

describe("analyzeStrategyMatrix", () => {
  it("deduplicates accounts, aggregates facts and chooses the lowest finite CPA", () => {
    const observations = [
      observation({ accountId: "a-1", cost: 40, realConversion: 2 }),
      observation({ accountId: "a-1", cost: 10, realConversion: 1 }),
      observation({ accountId: "a-2", cost: 30, realConversion: 1 }),
      observation({ accountId: "a-3", cost: 30, realConversion: 2 }),
      observation({ rowKey: "搜索", rowLabel: "搜索", accountId: "b-1", cost: 60, realConversion: 2 }),
      observation({ rowKey: "搜索", rowLabel: "搜索", accountId: "b-2", cost: 60, realConversion: 2 }),
      observation({ rowKey: "搜索", rowLabel: "搜索", accountId: "b-3", cost: 30, realConversion: 1 }),
    ];

    const result = analyzeStrategyMatrix(observations);
    expect(MIN_STRATEGY_ACCOUNTS).toBe(3);
    expect(MIN_STRATEGY_COST).toBe(100);
    expect(result.cells[0]).toMatchObject({
      rowKey: "信息流",
      columnKey: "ocpm",
      accountCount: 3,
      cost: 110,
      realConversion: 6,
      realCpa: { value: 110 / 6, state: "finite" },
      eligible: true,
      exclusionReasons: [],
    });
    expect(result.winner).toMatchObject({ rowKey: "信息流", columnKey: "ocpm" });
  });

  it("excludes cells with too few accounts, too little cost or non-finite CPA", () => {
    const result = analyzeStrategyMatrix([
      observation({ rowKey: "few", accountId: "a-1", cost: 200, realConversion: 5 }),
      observation({ rowKey: "few", accountId: "a-2", cost: 200, realConversion: 5 }),
      observation({ rowKey: "cheap", accountId: "b-1", cost: 30, realConversion: 1 }),
      observation({ rowKey: "cheap", accountId: "b-2", cost: 30, realConversion: 1 }),
      observation({ rowKey: "cheap", accountId: "b-3", cost: 30, realConversion: 1 }),
      observation({ rowKey: "zero", accountId: "c-1", cost: 40, realConversion: 0 }),
      observation({ rowKey: "zero", accountId: "c-2", cost: 40, realConversion: 0 }),
      observation({ rowKey: "zero", accountId: "c-3", cost: 40, realConversion: 0 }),
    ]);

    expect(result.cells.find((cell) => cell.rowKey === "few")?.exclusionReasons).toEqual([
      "insufficient_accounts",
    ]);
    expect(result.cells.find((cell) => cell.rowKey === "cheap")?.exclusionReasons).toEqual([
      "insufficient_cost",
    ]);
    expect(result.cells.find((cell) => cell.rowKey === "zero")?.exclusionReasons).toEqual([
      "non_finite_cpa",
    ]);
    expect(result.winner).toBeNull();
  });

  it("uses stable row/column ordering to break equal-CPA ties", () => {
    const observations = ["b", "a"].flatMap((rowKey) =>
      ["3", "1", "2"].map((accountId) =>
        observation({ rowKey, rowLabel: rowKey, accountId: `${rowKey}-${accountId}`, cost: 40, realConversion: 2 }),
      ),
    );
    const result = analyzeStrategyMatrix(observations);

    expect(result.cells.map((cell) => cell.rowKey)).toEqual(["a", "b"]);
    expect(result.winner?.rowKey).toBe("a");
  });

  it("rejects invalid observation identities and numbers", () => {
    expect(() => analyzeStrategyMatrix([observation({ accountId: "" })])).toThrow();
    expect(() => analyzeStrategyMatrix([observation({ cost: -1 })])).toThrow();
    expect(() => analyzeStrategyMatrix([observation({ realConversion: Number.POSITIVE_INFINITY })])).toThrow();
  });
});
