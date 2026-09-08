import { describe, expect, it } from "vitest";

import { ACTIVE_WORK_ITEM_STATUSES } from "@ka/domain";
import { TASK_LIST_COUNT_SQL, TASK_LIST_PAGE_SQL } from "../../src/task-list-sql.js";

/**
 * P-123 转 be2：任务列表的两处活动态集合原本写死 open/processing/escalated，漏了 dispatched
 * （v1.7.5 P-083 已把它并入活动态）。改成引用 domain 的冻结常量后，这里守住两件事：
 * ① 两段 SQL 都含全部活动态；② 不再有写死的三态字面量，下次再加态不会又漏一处。
 */
describe("task list active work-item states (P-123)", () => {
  const statements = { count: TASK_LIST_COUNT_SQL, page: TASK_LIST_PAGE_SQL };

  it.each(Object.entries(statements))("%s SQL includes every frozen active status", (_name, sql) => {
    for (const status of ACTIVE_WORK_ITEM_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(ACTIVE_WORK_ITEM_STATUSES).toContain("dispatched");
  });

  it.each(Object.entries(statements))("%s SQL no longer hard-codes the old three-state list", (_name, sql) => {
    expect(sql).not.toContain("'open', 'processing', 'escalated'");
  });

  it("keeps the interpolated list in sync with the constant, in order", () => {
    const rendered = ACTIVE_WORK_ITEM_STATUSES.map((status) => `'${status}'`).join(", ");
    for (const sql of Object.values(statements)) {
      expect(sql).toContain(`IN (${rendered})`);
    }
  });
});
