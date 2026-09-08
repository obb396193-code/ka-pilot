import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SEARCH_LIMIT_PER_TYPE, SEARCH_TYPES, normalizeSearchQuery, orderSearchItems,
  searchResultSchema, toLikePattern, type SearchItem,
} from "../../src/r014/search-contract.js";

const fixture = JSON.parse(
  readFileSync(new URL("../../../contract/fixtures/system/search.json", import.meta.url), "utf8"),
) as { data: { items: SearchItem[] } };

describe("v1.7.4 G6 global search", () => {
  it("parses the frozen fixture (v1.9 ⑦: structured meta, no backend-composed subtitle)", () => {
    const parsed = searchResultSchema.parse(fixture.data);
    expect(parsed.recent).toEqual([{ type: "task", id: "fixture-task-ready", title: "AAC 拉新", href: "/tasks/fixture-task-ready" }]);
    expect(new Set(fixture.data.items.map((item) => item.type)).size).toBeGreaterThan(1);
    for (const item of fixture.data.items) expect(SEARCH_TYPES).toContain(item.type);
    // v1.9 ⑦：后端不再出 subtitle，中文由 fe 从 meta 组装。
    for (const item of fixture.data.items) expect(item).not.toHaveProperty("subtitle");
    expect(fixture.data.items.find((item) => item.type === "task")!.meta)
      .toEqual({ stage: "active", accountCount: 3 });
  });

  it("caps each type at five results", () => {
    const many = Array.from({ length: SEARCH_LIMIT_PER_TYPE + 1 }, (_, index) => ({
      type: "account" as const, id: `a${index}`, title: "t", meta: {}, href: "/a", workspaceKind: "personal" as const,
    }));
    expect(() => searchResultSchema.parse({ items: many })).toThrow(/at most 5 account items/);
    expect(() => searchResultSchema.parse({ items: many.slice(1) })).not.toThrow();
  });

  it("groups by the fixed type order while keeping relevance order inside a group", () => {
    const items: SearchItem[] = [
      { type: "task", id: "t1", title: "t1", meta: {}, href: "/t1", workspaceKind: "personal" },
      { type: "account", id: "a1", title: "a1", meta: {}, href: "/a1", workspaceKind: "personal" },
      { type: "task", id: "t2", title: "t2", meta: {}, href: "/t2", workspaceKind: "personal" },
    ];
    expect(orderSearchItems(items).map((item) => item.id)).toEqual(["a1", "t1", "t2"]);
  });

  it("refuses an empty or oversized query instead of dumping the whole database", () => {
    expect(normalizeSearchQuery("")).toBeNull();
    expect(normalizeSearchQuery("   ")).toBeNull();
    expect(normalizeSearchQuery("x".repeat(129))).toBeNull();
    expect(normalizeSearchQuery(null)).toBeNull();
    expect(normalizeSearchQuery("  AAC   拉新 ")).toBe("AAC 拉新");
  });

  it("escapes LIKE wildcards so a literal % does not match everything", () => {
    expect(toLikePattern("100%")).toBe("%100\\%%");
    expect(toLikePattern("a_b")).toBe("%a\\_b%");
    expect(toLikePattern("c\\d")).toBe("%c\\\\d%");
  });
});
