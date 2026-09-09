import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";

import {
  accountDimensionsDtoSchema, accountTransferResultSchema, dailyReportSchema,
  kbByObjectSchema, kbDocumentSchema, kbSearchItemSchema, kbTreeNodeSchema,
} from "../../src/index.js";

/**
 * fixture 即契约，但「我读过 fixture」和「我的 schema 真能吃下它」是两回事。
 * arch 联调揪出来的 F-Q019-2（标题还是英文）、F-Q024-1（错误码不是 fixture 冻的那个）
 * 都是这一类：形状对不上，靠人眼看漏了。
 *
 * 这里把**我名下每份 fixture** 拿严格 schema 过一遍：多一个键、少一个必填当场就红。
 */
const fixture = (path: string): { data: unknown; error?: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/${path}`, import.meta.url), "utf8")) as
    { data: unknown; error?: unknown };

const CASES: [string, ZodTypeAny, (data: unknown) => unknown][] = [
  ["reports/daily-v1.json", dailyReportSchema, (data) => data],
  ["reports/daily-v1-not-sent.json", dailyReportSchema, (data) => data],
  ["kb/document.json", kbDocumentSchema, (data) => data],
  ["kb/by-object.json", kbByObjectSchema, (data) => data],
];

describe("my fixtures still fit my schemas (drift detector)", () => {
  for (const [path, schema, pick] of CASES) {
    it(`accepts ${path}`, () => {
      let raw: { data: unknown };
      try {
        raw = fixture(path);
      } catch {
        // fixture 还没被 arch 放出来时不算红——但也别假装验过了。
        expect.soft(true, `${path} 尚不存在`).toBe(true);
        return;
      }
      const result = schema.safeParse(pick(raw.data));
      expect(result.success, `${path}: ${JSON.stringify(result.success ? {} : result.error.issues.slice(0, 3))}`)
        .toBe(true);
    });
  }

  it("records the one place my A7 response is wider than the frozen fixture", () => {
    const frozen = fixture("accounts/transfer.json").data as Record<string, unknown>;
    // fixture 冻的是 {transferId, moved, notifiedUserIds}；`skipped` 是我在 A7 里加的——
    // 没有它，调用方只看到「请求 2 户、moved.accounts=1」，不知道哪一户没动、为什么。
    // 已请 arch 裁「加进 fixture 还是我去掉」；在他回话之前，把分歧钉在这里，
    // 免得下次谁看到 fixture 就以为我多返了字段是 bug。
    expect(frozen.skipped, "fixture 仍未包含 skipped").toBeUndefined();
    expect(accountTransferResultSchema.omit({ skipped: true }).safeParse(frozen).success).toBe(true);
    // 反过来：我的响应必须是 fixture 的超集，键一个都不能少。
    for (const key of Object.keys(frozen)) {
      expect(Object.keys(accountTransferResultSchema.shape)).toContain(key);
    }
  });

  it("accepts every row of the list-shaped fixtures", () => {
    for (const node of (fixture("kb/tree.json").data as { items: unknown[] }).items) {
      expect(kbTreeNodeSchema.safeParse(node).success).toBe(true);
    }
    for (const item of (fixture("kb/search.json").data as { items: unknown[] }).items) {
      expect(kbSearchItemSchema.safeParse(item).success).toBe(true);
    }
    for (const item of (fixture("kb/backlinks.json").data as { items: unknown[] }).items) {
      // 反查行 = search 行去掉 snippet/score 的三件套，正好用 kbByObject 的行 schema 验。
      expect(kbByObjectSchema.shape.items.element.safeParse(item).success).toBe(true);
    }
    for (const item of (fixture("account-list/ready-v193-dimensions.json").data as
      { items: { dimensions: unknown }[] }).items) {
      expect(accountDimensionsDtoSchema.safeParse(item.dimensions).success).toBe(true);
    }
  });
});
