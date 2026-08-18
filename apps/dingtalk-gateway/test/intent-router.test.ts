import { describe, expect, it } from "vitest";

import { routeIntent } from "../src/intent-router.js";

describe("routeIntent", () => {
  it.each([
    ["/查数 今日消耗", "query"],
    ["数据 a-1 昨日表现", "query"],
    ["/创建任务 快手拉新", "create_task"],
    ["建任务 预算10万", "create_task"],
    ["/帮助", "help"],
    ["分析一下为什么这批账户不跑量", "agent"],
  ] as const)("routes %s to %s", (text, kind) => {
    expect(routeIntent(text).kind).toBe(kind);
  });
});
