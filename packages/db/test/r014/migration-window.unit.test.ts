import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { migrationCount, windowSize } from "../migration-window.js";

// 本测试自己也不许写死迁移号：否则 013/014/016 落地时它就重蹈「窗口写死在头部」的覆辙。
const names = readdirSync(new URL("../../migrations", import.meta.url)).filter((n) => n.endsWith(".cjs")).sort();

describe("head-relative migration windows", () => {
  it("measures the window from a named migration to the current head", () => {
    expect(migrationCount()).toBe(names.length);
    expect(windowSize(names[names.length - 1]!.slice(0, 3))).toBe(1);
    expect(windowSize(names[0]!.slice(0, 3))).toBe(names.length);
    expect(windowSize(names[names.length - 2]!.slice(0, 3))).toBe(2);
  });

  it("refuses an unknown migration instead of silently rolling back everything", () => {
    expect(() => windowSize("099")).toThrow(/unknown migration/);
  });
});
