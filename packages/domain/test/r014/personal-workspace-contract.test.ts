import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_IDENTITY_PREFERENCES,
  applyPreferencesPatch,
  dedupeWatchlistItems,
  identityPreferencesPatchSchema,
  identityPreferencesSchema,
  normalizeWatchlistItem,
  normalizeWatchlistItems,
  savedViewCreateSchema,
  savedViewPatchSchema,
  savedViewSchema,
  watchlistSchema,
} from "../../src/r014/personal-workspace-contract.js";

const fixture = (name: string): { data: unknown } =>
  JSON.parse(readFileSync(new URL(`../../../contract/fixtures/${name}`, import.meta.url), "utf8"));

describe("v1.7.1 identity preferences", () => {
  it("parses the frozen fixture", () => {
    expect(identityPreferencesSchema.parse(fixture("me/preferences.json").data))
      .toEqual({ theme: { mode: "bw", hue: "#ff6a2c" }, locale: "zh-CN", updatedAt: "2026-09-05T20:00:00.000+08:00" });
  });

  it("defaults to mode bw without inventing a hue, a locale or a timestamp", () => {
    expect(identityPreferencesSchema.parse(DEFAULT_IDENTITY_PREFERENCES)).toEqual(DEFAULT_IDENTITY_PREFERENCES);
    expect(DEFAULT_IDENTITY_PREFERENCES.theme.hue).toBeUndefined();
    expect(DEFAULT_IDENTITY_PREFERENCES.locale).toBeNull();
    expect(DEFAULT_IDENTITY_PREFERENCES.updatedAt).toBeNull();
  });

  it("rejects unknown modes, malformed hues, empty patches and unknown keys", () => {
    expect(() => identityPreferencesSchema.parse({ theme: { mode: "dark" }, locale: null, updatedAt: null })).toThrow();
    expect(() => identityPreferencesSchema.parse({ theme: { mode: "bw", hue: "ff6a2c" }, locale: null, updatedAt: null })).toThrow();
    expect(() => identityPreferencesPatchSchema.parse({})).toThrow(/at least one field/);
    expect(() => identityPreferencesPatchSchema.parse({ theme: { mode: "bw" }, colour: "red" })).toThrow();
    expect(() => identityPreferencesPatchSchema.parse({ theme: { hue: "#ffffff" } })).toThrow();
  });

  it("patches only the supplied fields and can clear locale explicitly", () => {
    const current = { theme: { mode: "full" as const, hue: "#112233" }, locale: "zh-CN", updatedAt: "2026-09-05T20:00:00.000+08:00" };
    expect(applyPreferencesPatch(current, { locale: "en-US" })).toEqual({ theme: current.theme, locale: "en-US" });
    expect(applyPreferencesPatch(current, { locale: null })).toEqual({ theme: current.theme, locale: null });
    expect(applyPreferencesPatch(current, { theme: { mode: "bw" } })).toEqual({ theme: { mode: "bw" }, locale: "zh-CN" });
  });
});

describe("v1.7.4 G2 watchlist items", () => {
  it("parses the frozen fixture including the task-typed item", () => {
    const parsed = watchlistSchema.parse(fixture("me/watchlist.json").data);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[2]).toEqual({ type: "task", taskId: "fixture-task-ready" });
  });

  it("treats a legacy item without type as an account item", () => {
    expect(normalizeWatchlistItem({ media: "KUAISHOU", accountId: "account-1" }))
      .toEqual({ type: "account", media: "KUAISHOU", accountId: "account-1" });
    expect(normalizeWatchlistItems([{ media: "KUAISHOU", accountId: "a" }, { type: "task", taskId: "t" }]))
      .toEqual([{ type: "account", media: "KUAISHOU", accountId: "a" }, { type: "task", taskId: "t" }]);
  });

  it("rejects malformed items instead of silently dropping a user's watch", () => {
    expect(() => normalizeWatchlistItem({ type: "account", taskId: "t" })).toThrow();
    expect(() => normalizeWatchlistItem({ type: "task", taskId: "t", media: "KUAISHOU" })).toThrow();
    expect(() => normalizeWatchlistItem({ type: "campaign", id: "c" })).toThrow();
    expect(() => normalizeWatchlistItem({ media: "kuaishou", accountId: "a" })).toThrow();
    expect(() => normalizeWatchlistItem(null)).toThrow();
  });

  it("dedupes by identity while preserving submission order", () => {
    expect(dedupeWatchlistItems([
      { type: "account", media: "KUAISHOU", accountId: "a" },
      { type: "task", taskId: "t" },
      { type: "account", media: "KUAISHOU", accountId: "a" },
      { type: "account", media: "DOUYIN", accountId: "a" },
    ])).toEqual([
      { type: "account", media: "KUAISHOU", accountId: "a" },
      { type: "task", taskId: "t" },
      { type: "account", media: "DOUYIN", accountId: "a" },
    ]);
  });
});

describe("v1.5 3.10 saved views", () => {
  it("parses the frozen fixture", () => {
    const items = (fixture("me/views.json").data as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    const view = savedViewSchema.parse(items[0]);
    expect(view.page).toBe("data.table");
    expect(view.config.version).toBe("view/v1");
    expect(view.isShared).toBe(false);
  });

  it("pins the config version and the six pages", () => {
    const base = { page: "accounts" as const, name: "n", config: { version: "view/v1" as const } };
    expect(savedViewCreateSchema.parse(base).isShared).toBeUndefined();
    expect(() => savedViewCreateSchema.parse({ ...base, page: "materials" })).toThrow();
    expect(() => savedViewCreateSchema.parse({ ...base, config: { version: "view/v2" } })).toThrow();
    expect(() => savedViewCreateSchema.parse({ ...base, config: { version: "view/v1", extra: 1 } })).toThrow();
    expect(() => savedViewCreateSchema.parse({ ...base, name: "" })).toThrow();
  });

  it("requires a patch to change something", () => {
    expect(() => savedViewPatchSchema.parse({})).toThrow(/at least one field/);
    expect(savedViewPatchSchema.parse({ isShared: true })).toEqual({ isShared: true });
  });
});
