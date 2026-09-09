import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildDocumentTree, buildSnippet, collectMentions, contentFingerprint,
  kbDocumentSchema, kbTreeNodeSchema, kbSearchItemSchema,
  projectContentText, relevanceScore, splitMentions,
} from "../../src/r014/kb-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/kb/${name}.json`, import.meta.url), "utf8")) as { data: unknown };

describe("kb contract (v1.4 8.x)", () => {
  it("accepts the frozen document / tree / search fixtures", () => {
    const document = (fixture("document").data) as Record<string, unknown>;
    expect(kbDocumentSchema.parse(document).id).toBe("00000000-0000-4000-8000-000000002702");
    for (const node of (fixture("tree").data as { items: unknown[] }).items) kbTreeNodeSchema.parse(node);
    for (const item of (fixture("search").data as { items: unknown[] }).items) kbSearchItemSchema.parse(item);
  });

  it("reproduces the fixture's contentText from its contentJson", () => {
    const document = fixture("document").data as { contentJson: unknown; contentText: string };
    // 投影函数是 PATCH 时重算 content_text 的唯一来源；跟 fixture 对不上就是形状理解错了。
    expect(projectContentText(document.contentJson)).toBe(document.contentText);
  });

  it("pulls the fixture's businessRefs out of the mention node", () => {
    const document = fixture("document").data as { contentJson: unknown; businessRefs: unknown };
    const { businessRefs } = splitMentions(collectMentions(document.contentJson));
    expect(businessRefs).toEqual(document.businessRefs);
  });

  it("reads both mention nodes and [[title]] as document links", () => {
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "text", text: "见 [[2026-09-05 日报]] 与 [[SOP]]，重复的 [[SOP]] 只算一次" },
        { type: "mention", attrs: { type: "document", id: "00000000-0000-4000-8000-000000002704", label: "日报" } },
      ] }],
    };
    const { documentRefs } = splitMentions(collectMentions(content));
    expect(documentRefs).toEqual([
      { id: null, label: "2026-09-05 日报" },
      { id: null, label: "SOP" },
      { id: "00000000-0000-4000-8000-000000002704", label: "日报" },
    ]);
  });

  it("drops mentions of types kb_business_refs cannot hold", () => {
    const content = { type: "doc", content: [{ type: "paragraph", content: [
      { type: "mention", attrs: { type: "planet", id: "x", label: "火星" } },
      { type: "mention", attrs: { type: "task", label: "没有 id 的任务" } },
      { type: "mention", attrs: { type: "account", id: "acc-1", label: "账户" } },
    ] }] };
    // 未知类型和无 id 的引用都丢：塞进有限枚举的反查表等于污染 8.4。
    expect(splitMentions(collectMentions(content)).businessRefs).toEqual([{ type: "account", id: "acc-1" }]);
  });

  it("keeps the text projection stable and fingerprints it", () => {
    expect(projectContentText(null)).toBe("");
    expect(contentFingerprint("")).toHaveLength(64);
    expect(contentFingerprint("同一段正文")).toBe(contentFingerprint("同一段正文"));
    expect(contentFingerprint("甲")).not.toBe(contentFingerprint("乙"));
  });

  it("builds the fixture tree shape from flat rows", () => {
    const tree = buildDocumentTree([
      { id: "00000000-0000-4000-8000-000000002702", title: "新任务开户到基建 SOP", kind: "sop",
        parentId: "00000000-0000-4000-8000-000000002701", position: "a" },
      { id: "00000000-0000-4000-8000-000000002701", title: "SOP", kind: "sop", parentId: null, position: "a" },
    ]);
    expect(tree).toEqual((fixture("tree").data as { items: unknown[] }).items.slice(0, 1));
  });

  it("keeps orphans as roots instead of dropping them", () => {
    const tree = buildDocumentTree([
      { id: "00000000-0000-4000-8000-00000000aaaa", title: "父被删的孤儿", kind: "manual",
        parentId: "00000000-0000-4000-8000-00000000ffff", position: null },
    ]);
    // 父不可见（被删/无权限）时文档还在，绝不能因为挂不上父就从列表里消失。
    expect(tree).toHaveLength(1);
    expect(tree[0]!.title).toBe("父被删的孤儿");
  });

  it("ranks a title hit above a body hit and misses at zero", () => {
    const titleHit = relevanceScore("开户", "新任务开户到基建 SOP", "正文");
    const bodyHit = relevanceScore("开户", "无关标题", "准备 → 开户 → 充值");
    expect(titleHit).toBeGreaterThan(bodyHit);
    expect(bodyHit).toBeGreaterThan(0);
    expect(relevanceScore("不存在的词", "标题", "正文")).toBe(0);
    expect(relevanceScore("  ", "标题", "正文")).toBe(0);
  });

  it("cuts the snippet around the hit", () => {
    const snippet = buildSnippet("充值", `准备 → 开户 → 充值 → 基建 → 冷启动观察。${"后面还有很长一段正文用来把窗口撑满以验证截断。".repeat(6)}`);
    expect(snippet).toContain("充值");
    expect(snippet.endsWith(" …")).toBe(true);
  });
});
