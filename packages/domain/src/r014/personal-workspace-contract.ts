import { z } from "zod";

// v1.5 3.10 / v1.7.1 / v1.7.4 G2：个人域三张表的对外 DTO。
// fixture 即契约（me/preferences.json、me/watchlist.json、me/views.json），字段一律照抄，不自造。

const isoDateTimeSchema = z.string().datetime({ offset: true });
const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable();
const mediaSchema = z.string().min(1).max(32).regex(/^[A-Z0-9_]+$/);
const accountIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const taskIdSchema = z.string().min(1).max(128);

/* ── v1.7.1 用户偏好（identity 级，跨空间） ─────────────────────────── */

export const themeModeSchema = z.enum(["bw", "bwc", "full"]);
/** hue 可缺省：从未设置过偏好的身份没有 hue，后端不替前端编一个品牌色。 */
export const themePreferenceSchema = z.object({
  mode: themeModeSchema,
  hue: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict();

export const identityPreferencesSchema = z.object({
  theme: themePreferenceSchema,
  locale: z.string().min(2).max(35).nullable(),
  updatedAt: nullableIsoDateTimeSchema,
}).strict();
export type IdentityPreferences = z.infer<typeof identityPreferencesSchema>;

/** PATCH 是部分更新：只带来的键才覆盖，theme 整块替换（mode 必填，避免出现无 mode 的半个主题）。 */
export const identityPreferencesPatchSchema = z.object({
  theme: themePreferenceSchema.optional(),
  locale: z.string().min(2).max(35).nullable().optional(),
}).strict().refine(
  (patch) => patch.theme !== undefined || patch.locale !== undefined,
  { message: "preferences patch must change at least one field" },
);
export type IdentityPreferencesPatch = z.infer<typeof identityPreferencesPatchSchema>;

/** 老板 D1：默认 mode=bw，用户改过才变；没有 hue 就是没有，不编。 */
export const DEFAULT_IDENTITY_PREFERENCES: IdentityPreferences = {
  theme: { mode: "bw" },
  locale: null,
  updatedAt: null,
};

export function applyPreferencesPatch(
  current: IdentityPreferences,
  patch: IdentityPreferencesPatch,
): Omit<IdentityPreferences, "updatedAt"> {
  const parsed = identityPreferencesPatchSchema.parse(patch);
  return {
    theme: parsed.theme ?? current.theme,
    locale: parsed.locale === undefined ? current.locale : parsed.locale,
  };
}

/* ── v1.5 3.5 + v1.7.4 G2 盯盘名单（account 型 + task 型） ──────────── */

export const watchlistItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("account"), media: mediaSchema, accountId: accountIdSchema }).strict(),
  z.object({ type: z.literal("task"), taskId: taskIdSchema }).strict(),
]);
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

export const watchlistSchema = z.object({
  items: z.array(watchlistItemSchema).max(500),
  updatedAt: nullableIsoDateTimeSchema,
}).strict();
export type Watchlist = z.infer<typeof watchlistSchema>;

/**
 * G2 老数据兼容：入库时不带 `type` 的旧项一律视为 account 型。
 * 只认识两种形状，其余（含 type 拼错、account 少键、task 多键）一律拒绝——
 * 静默丢弃会让用户以为关注还在。
 */
export function normalizeWatchlistItem(input: unknown): WatchlistItem {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return watchlistItemSchema.parse(input);
  }
  const candidate = input as Record<string, unknown>;
  if (candidate.type === undefined) {
    return watchlistItemSchema.parse({ type: "account", media: candidate.media, accountId: candidate.accountId });
  }
  return watchlistItemSchema.parse(candidate);
}

export function normalizeWatchlistItems(input: readonly unknown[]): WatchlistItem[] {
  return input.map((item) => normalizeWatchlistItem(item));
}

/** 同一账户/任务重复关注没有意义，去重后落库；顺序按用户提交的先后保留。 */
export function dedupeWatchlistItems(items: readonly WatchlistItem[]): WatchlistItem[] {
  const seen = new Set<string>();
  const result: WatchlistItem[] = [];
  for (const item of items) {
    const key = item.type === "account" ? `account:${item.media}:${item.accountId}` : `task:${item.taskId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/* ── v1.5 3.10 个人视图 ─────────────────────────────────────────────── */

export const savedViewPageSchema = z.enum([
  "data.table", "data.pivot", "accounts", "tasks", "work_items", "data.live",
]);

export const savedViewConfigSchema = z.object({
  version: z.literal("view/v1"),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.array(z.string().min(1)).max(200).optional(),
  sort: z.array(z.object({ by: z.string().min(1), dir: z.enum(["asc", "desc"]) }).strict()).max(20).optional(),
  window: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type SavedViewConfig = z.infer<typeof savedViewConfigSchema>;

export const savedViewSchema = z.object({
  id: z.string().uuid(),
  page: savedViewPageSchema,
  name: z.string().min(1).max(120),
  config: savedViewConfigSchema,
  isShared: z.boolean(),
  updatedAt: isoDateTimeSchema,
}).strict();
export type SavedView = z.infer<typeof savedViewSchema>;

export const savedViewCreateSchema = z.object({
  page: savedViewPageSchema,
  name: z.string().min(1).max(120),
  config: savedViewConfigSchema,
  isShared: z.boolean().optional(),
}).strict();
export type SavedViewCreate = z.infer<typeof savedViewCreateSchema>;

export const savedViewPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: savedViewConfigSchema.optional(),
  isShared: z.boolean().optional(),
}).strict().refine(
  (patch) => Object.keys(patch).length > 0,
  { message: "saved view patch must change at least one field" },
);
export type SavedViewPatch = z.infer<typeof savedViewPatchSchema>;
