import { describe, expect, it } from "vitest";
import { accounts, dashboardTotals, roleViews } from "./demo-data";
import { formatCurrency, formatDateTime, formatPercent } from "./formatters";

describe("shared demo data", () => {
  it("uses consistent totals across all role views", () => {
    expect(roleViews.optimizer.totals).toBe(dashboardTotals);
    expect(roleViews.manager.totals).toBe(dashboardTotals);
    expect(roleViews.hybrid.totals).toBe(dashboardTotals);
  });

  it("contains synthetic records only", () => {
    expect(accounts.length).toBeGreaterThan(4);
    expect(accounts.every((account) => account.synthetic)).toBe(true);
    expect(accounts.every((account) => /^演示账户-/.test(account.name))).toBe(
      true,
    );
  });
});

describe("Intl formatters", () => {
  it("formats Chinese currency, percent and Shanghai time", () => {
    expect(formatCurrency(128640.72)).toContain("128,640.72");
    expect(formatPercent(0.824)).toBe("82.4%");
    expect(formatDateTime("2026-08-20T10:42:00+08:00")).toContain("08/20");
  });
});
