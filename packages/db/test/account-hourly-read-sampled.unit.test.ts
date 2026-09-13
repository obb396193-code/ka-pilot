import { describe, expect, it, vi } from "vitest";

import { AccountHourlyReadRepository } from "../src/account-hourly-read-repository.js";

/**
 * v1.9.39 整日采样存在性的**无库单测**：这条查询回答的是「这一天这个账户在小时表里有没有出现过」，
 * 用来把「还没采到」（pending）和「采过了就是没有」（missing）分开。
 *
 * 真 PG 用例在 `account-hourly-read-repository.test.ts`，要连库；这里用假 client 盯住不依赖 PG 的三件事：
 * 查询确实按**整日**发（不带小时条件），授权谓词的列**带表前缀**（裸列名会退化成恒真，A38），
 * 以及库里返回越权账户时当场拒绝而不是照单全收。
 */
const ws = "00000000-0000-4000-8000-000000000001";
const auth = {
  workspaceId: ws, userId: "00000000-0000-4000-8000-000000000002", role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a", accessLevel: "read" }] },
};
const request = { date: "2026-09-09", media: "KUAISHOU", hhFrom: 1, hhTo: 2 };

function poolFor(handler: (sql: string) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string) => {
    if (!sql.includes("SELECT")) return { rows: [] };
    if (sql.includes("to_regclass")) return { rows: [{ available: true }] };
    return handler(sql);
  });
  const client = { query, on: vi.fn(), removeListener: vi.fn(), release: vi.fn() };
  return { query, pool: { connect: async () => client } };
}
const sampledCall = (query: { mock: { calls: unknown[][] } }) =>
  query.mock.calls.map((call) => String(call[0])).find((sql) => sql.includes("hourly-read-sampled-accounts"));

describe("v1.9.39 whole-day sampling existence", () => {
  it("asks for the whole day, not the requested hours", async () => {
    const { pool, query } = poolFor(() => ({ rows: [] }));
    await new AccountHourlyReadRepository(pool as never).read(auth, request);
    const sql = sampledCall(query as never);
    expect(sql, "没发这条查询就分不出 pending 和 missing").toBeDefined();
    // 带上 hh 条件就又变成「这几个小时里没有」，窗口一窄就会把正常账户说成没采到。
    expect(sql).not.toMatch(/\bhh\b/);
    expect(sql).toContain("h.ds=$3");
    expect(sql).toContain("GROUP BY h.media, h.account_id");
  });

  it("qualifies the authorization predicate with the table alias", () => {
    const { pool, query } = poolFor(() => ({ rows: [] }));
    return new AccountHourlyReadRepository(pool as never).read(auth, request).then(() => {
      const sql = sampledCall(query as never)!;
      // 不带前缀的裸 media/account_id 会先命中作用域子查询自己那一层，把闸退化成恒真。
      expect(sql).toContain("h.media");
      expect(sql).toContain("h.account_id");
    });
  });

  it("returns the sampled accounts it was given", async () => {
    const { pool } = poolFor((sql) => sql.includes("hourly-read-sampled-accounts")
      ? { rows: [{ media: "KUAISHOU", account_id: "a" }] } : { rows: [] });
    const snapshot = await new AccountHourlyReadRepository(pool as never).read(auth, request);
    expect(snapshot.sampledAccounts).toEqual([{ media: "KUAISHOU", accountId: "a" }]);
  });

  it("refuses a row outside the grant instead of widening the scope", async () => {
    const { pool } = poolFor((sql) => sql.includes("hourly-read-sampled-accounts")
      ? { rows: [{ media: "KUAISHOU", account_id: "not-granted" }] } : { rows: [] });
    await expect(new AccountHourlyReadRepository(pool as never).read(auth, request))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
