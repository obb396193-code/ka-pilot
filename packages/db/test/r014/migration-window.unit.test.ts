import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { windowSize } from "./migration-window.js";

describe("head-relative migration windows", () => {
  it("measures the window from a named migration to the current head", () => {
    const names = readdirSync(new URL("../../migrations", import.meta.url)).filter((n) => n.endsWith(".cjs")).sort();
    expect(names[names.length - 1]).toBe("015_contract_v1_5.cjs");
    expect(windowSize("015")).toBe(1);
    expect(windowSize("012")).toBe(2);
    // 头部位移后窗口自动跟着变：这正是 7 个既有回放测试写死 count 时缺的性质。
    expect(windowSize("008")).toBe(names.length - names.findIndex((n) => n.startsWith("008")));
  });

  it("refuses an unknown migration instead of silently rolling back everything", () => {
    expect(() => windowSize("099")).toThrow(/unknown migration/);
  });
});
