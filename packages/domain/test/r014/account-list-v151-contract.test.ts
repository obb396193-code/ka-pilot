import { describe, expect, it } from "vitest";

import {
  accountGroupBySchema, accountListItemSchema, accountListRequestSchema, accountPoolStatusSchema,
} from "../../src/account-list-contract.js";

// S6：v1.5.1 ① 给账户列表加的字段（六文件已由 arch 临时移交 be2）。
const BASE_ITEM = {
  workspaceId: "00000000-0000-4000-8000-000000000024",
  media: "KUAISHOU" as const,
  accountId: "account-1",
  accountName: "AAC拉新_快手_01",
  status: "active",
  lifecycleStage: "stable" as const,
  starred: false,
  tags: [],
  owner: null,
  linkedTasks: [],
  metrics: null,
  balance: {
    value: 15200,
    syncedAt: "2026-09-05T08:00:00.000+08:00",
    cutoff: { hours: { value: null, availability: "missing" as const }, state: "unknown" as const },
  },
  poolStatus: "in_delivery" as const,
  poolStatusSource: "system" as const,
  product: { name: "AAC 拉新包", ref: null },
  dailyBudgetCap: null,
  capacityLoad: { value: null, state: "undefined" as const },
  lastAction: { at: "2026-09-05T08:42:00.000+08:00", kind: "changeset" as const, summary: "降价 5%" },
  nextSuggestion: null,
};

describe("v1.5.1 ① account list additions", () => {
  it("accepts the nine pool states alongside the six lifecycle stages", () => {
    expect(accountPoolStatusSchema.options).toHaveLength(9);
    for (const poolStatus of accountPoolStatusSchema.options) {
      expect(() => accountListItemSchema.parse({ ...BASE_ITEM, poolStatus })).not.toThrow();
    }
    // 库存态与投放态是两个维度，互不替代。
    expect(() => accountListItemSchema.parse({ ...BASE_ITEM, poolStatus: "stable" })).toThrow();
    expect(() => accountListItemSchema.parse({ ...BASE_ITEM, lifecycleStage: "in_delivery" })).toThrow();
  });

  it("keeps cutoff unknown while the hourly velocity source is not ours to read", () => {
    const parsed = accountListItemSchema.parse(BASE_ITEM);
    expect(parsed.balance?.cutoff).toEqual({ hours: { value: null, availability: "missing" }, state: "unknown" });
    // fixture 已升级，cutoff 现在必填：balance 在却没有 cutoff 会让前端以为
    // 「这个户没有断量倒计时这回事」，而真相是「算不出来」。
    expect(() => accountListItemSchema.parse({
      ...BASE_ITEM, balance: { value: 1, syncedAt: "2026-09-05T08:00:00.000+08:00" },
    })).toThrow();
    expect(() => accountListItemSchema.parse({
      ...BASE_ITEM,
      balance: { value: 1, syncedAt: "2026-09-05T08:00:00.000+08:00", cutoff: { state: "ok" } },
    })).toThrow();
    expect(() => accountListItemSchema.parse({
      ...BASE_ITEM,
      balance: { ...BASE_ITEM.balance, cutoff: { hours: BASE_ITEM.balance.cutoff.hours, state: "stale" } },
    })).toThrow();
  });

  it("now requires every v1.5.1 field, so a service that forgets one cannot pass silently", () => {
    for (const key of ["poolStatus", "poolStatusSource", "product", "dailyBudgetCap", "capacityLoad", "lastAction", "nextSuggestion"]) {
      const withoutKey = { ...BASE_ITEM } as Record<string, unknown>;
      delete withoutKey[key];
      expect(() => accountListItemSchema.parse(withoutKey), key).toThrow();
    }
  });

  it("keeps the budget-derived fields empty until migration 014 lands, never zero", () => {
    const parsed = accountListItemSchema.parse(BASE_ITEM);
    expect(parsed.dailyBudgetCap).toBeNull();
    expect(parsed.capacityLoad).toEqual({ value: null, state: "undefined" });
    expect(() => accountListItemSchema.parse({ ...BASE_ITEM, capacityLoad: { value: 0, state: "finite" } })).not.toThrow();
  });

  it("allows a null suggestion and refuses a suggestion without a real work item", () => {
    expect(accountListItemSchema.parse(BASE_ITEM).nextSuggestion).toBeNull();
    expect(() => accountListItemSchema.parse({
      ...BASE_ITEM, nextSuggestion: { workItemId: "00000000-0000-4000-8000-000000000402", title: "成本超考核" },
    })).not.toThrow();
    // 没有工作项 id 的「建议」就是编的。
    expect(() => accountListItemSchema.parse({ ...BASE_ITEM, nextSuggestion: { title: "试试降价" } })).toThrow();
    expect(() => accountListItemSchema.parse({ ...BASE_ITEM, nextSuggestion: { workItemId: "not-a-uuid", title: "x" } })).toThrow();
  });

  it("only recognises the three action kinds the backend can actually observe", () => {
    for (const kind of ["changeset", "external_change", "pool_status"] as const) {
      expect(() => accountListItemSchema.parse({ ...BASE_ITEM, lastAction: { ...BASE_ITEM.lastAction, kind } })).not.toThrow();
    }
    expect(() => accountListItemSchema.parse({ ...BASE_ITEM, lastAction: { ...BASE_ITEM.lastAction, kind: "dispatch" } })).toThrow();
  });

  it("takes multi-valued pool filters, a product filter and defaults groupBy to none", () => {
    // groupBy 不设 .default()：默认值会往解析结果里塞键，破坏既有那批「精确形状」断言。
    expect(accountListRequestSchema.parse({ media: "KUAISHOU" })).toEqual({ page: 1, pageSize: 20, media: "KUAISHOU" });
    expect(accountListRequestSchema.parse({ groupBy: "product" }).groupBy).toBe("product");
    expect(accountListRequestSchema.parse({ poolStatus: ["available", "paused"] }).poolStatus).toEqual(["available", "paused"]);
    expect(accountListRequestSchema.parse({ product: " AAC " }).product).toBe("AAC");
    expect(() => accountListRequestSchema.parse({ poolStatus: [] })).toThrow();
    expect(() => accountListRequestSchema.parse({ poolStatus: ["stable"] })).toThrow();
    expect(() => accountListRequestSchema.parse({ groupBy: "media" })).toThrow();
    expect(accountGroupBySchema.options).toEqual(["none", "lifecycle", "product", "owner", "task"]);
  });
});
