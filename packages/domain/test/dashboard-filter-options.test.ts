import { describe, expect, it } from "vitest";

import { buildDashboardFilterOptions } from "../src/dashboard-filter-options.js";

/** Q-041 ①：`GET /data/filters` 的级联与「只列 cost>0」两条口径，脱库验。 */
const day = (overrides: Partial<Parameters<typeof buildDashboardFilterOptions>[0][number]> = {}) => ({
  media: "KUAISHOU", accountId: "a1", ds: "2026-09-01",
  optimizer: "张三", biz: "拉新", taskId: "t-1", taskName: "拉新·主力", resourcePosition: "优选",
  cost: 100, ...overrides,
});

describe("v1.9.27 ④ dashboard filter options", () => {
  it("sums cost per option and orders the big spenders first", () => {
    const options = buildDashboardFilterOptions([
      day(), day({ ds: "2026-09-02", cost: 50 }),
      day({ accountId: "a2", optimizer: "李四", biz: "闪购", taskId: "t-2", taskName: "闪购", resourcePosition: "联盟", cost: 500 }),
    ], {});
    expect(options.optimizers).toEqual([
      { key: "李四", label: "李四", cost: 500 },
      { key: "张三", label: "张三", cost: 150 },
    ]);
    // 任务用 id 当 key、任务名当 label：筛选按 id，人看的是名字。
    expect(options.tasks[0]).toEqual({ key: "t-2", label: "闪购", cost: 500 });
    expect(options.resource_positions.map((entry) => entry.key)).toEqual(["联盟", "优选"]);
  });

  it("drops options that spent nothing and keeps missing cost out of the sum", () => {
    const options = buildDashboardFilterOptions([
      day({ optimizer: "零花费", cost: 0 }),
      // 花费取不到（拉数失败/没跑）：不计入求和，也不当 0——两者在「要不要列」上结论可能相反。
      day({ optimizer: "取不到", cost: null }),
      day({ optimizer: "有花费", cost: 10 }),
    ], {});
    expect(options.optimizers).toEqual([{ key: "有花费", label: "有花费", cost: 10 }]);
  });

  it("narrows each level by the levels above it", () => {
    const days = [
      day({ optimizer: "张三", biz: "拉新", taskId: "t-1", taskName: "甲" }),
      day({ optimizer: "李四", biz: "闪购", taskId: "t-2", taskName: "乙", accountId: "a2" }),
    ];
    // 选了张三之后，只该看到张三的业务与任务——不然点下去就是空数据。
    const narrowed = buildDashboardFilterOptions(days, { optimizer: ["张三"] });
    expect(narrowed.bizs.map((entry) => entry.key)).toEqual(["拉新"]);
    expect(narrowed.tasks.map((entry) => entry.key)).toEqual(["t-1"]);
    // 但优化师这一级自己不受自己约束，两个人都还在（否则选完就没得改了）。
    expect(narrowed.optimizers.map((entry) => entry.key).sort()).toEqual(["张三", "李四"].sort());
  });

  it("keeps unlabelled account-days out of the option list", () => {
    // 「未标注」不是一个可筛的值，前端有专门的桶；把 null 列成选项等于给它一个假名字。
    const options = buildDashboardFilterOptions([day({ optimizer: null }), day({ accountId: "a2" })], {});
    expect(options.optimizers).toEqual([{ key: "张三", label: "张三", cost: 100 }]);
  });

  it("returns empty groups rather than failing when nothing is in scope", () => {
    expect(buildDashboardFilterOptions([], {})).toEqual({
      optimizers: [], bizs: [], tasks: [], resource_positions: [],
    });
  });
});
