import { z } from "zod";

// v1.7.8 G10 统一通知流。**不新建表**：读时从 work_items / approvals / workflow_runs / system 事件投影；
// 已读态存 identity_preferences.preferences（notificationsReadAt + 单条已读集合）。
// `unread` 与 me/counts.notificationsUnread 同源同值——两处必须用同一个函数算，不各算各的。
export const notificationKindSchema = z.enum(["alert", "approval", "dispatch", "run", "system"]);
export const notificationSeveritySchema = z.enum(["p0", "p1", "p2", "info", "warning"]);

export const notificationSchema = z.object({
  id: z.string().min(1),
  kind: notificationKindSchema,
  severity: notificationSeveritySchema,
  title: z.string().min(1),
  body: z.string(),
  at: z.string().datetime({ offset: true }),
  read: z.boolean(),
  ref: z.object({ type: z.string().min(1), id: z.string().min(1) }).strict().nullable(),
  href: z.string().min(1),
}).strict();
export type Notification = z.infer<typeof notificationSchema>;

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  unread: z.number().int().nonnegative(),
  nextCursor: z.string().min(1).nullable(),
}).strict();
export type NotificationPage = z.infer<typeof notificationPageSchema>;

/** 投影源给出的一条候选，`read` 由已读态算出来，源不自己声明。 */
export type NotificationCandidate = Omit<Notification, "read">;

export const notificationReadStateSchema = z.object({
  /** 这个时点之前的全部视为已读（「全部已读」按钮写它）。 */
  notificationsReadAt: z.string().datetime({ offset: true }).nullable(),
  /** 单条已读集合；只存该时点之后的 id，随 readAt 前移而收缩。 */
  notificationsReadIds: z.array(z.string().min(1)).max(1000),
}).strict();
export type NotificationReadState = z.infer<typeof notificationReadStateSchema>;

export const EMPTY_READ_STATE: NotificationReadState = {
  notificationsReadAt: null,
  notificationsReadIds: [],
};

export function isRead(candidate: NotificationCandidate, state: NotificationReadState): boolean {
  if (state.notificationsReadIds.includes(candidate.id)) return true;
  if (state.notificationsReadAt === null) return false;
  return Date.parse(candidate.at) <= Date.parse(state.notificationsReadAt);
}

/** 倒序排；`at` 相同再按 id 排，保证分页游标稳定（同秒多条不会翻来覆去）。 */
export function sortNotifications(candidates: readonly NotificationCandidate[]): NotificationCandidate[] {
  return [...candidates].sort((a, b) => {
    const byTime = Date.parse(b.at) - Date.parse(a.at);
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });
}

/**
 * 把各源的候选拼成一页。`unread` 是**全量未读数**，不是本页未读数——
 * 铃铛上的数字要的是"还有多少没看"，按页算会随翻页变小。
 */
export function projectNotifications(
  candidates: readonly NotificationCandidate[],
  state: NotificationReadState,
  options: { limit?: number; cursor?: string; unreadOnly?: boolean } = {},
): NotificationPage {
  const parsedState = notificationReadStateSchema.parse(state);
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("notification limit out of range");

  const sorted = sortNotifications(candidates);
  const withRead = sorted.map((candidate) => ({ ...candidate, read: isRead(candidate, parsedState) }));
  const unread = withRead.filter((item) => !item.read).length;

  const visible = options.unreadOnly === true ? withRead.filter((item) => !item.read) : withRead;
  const start = options.cursor === undefined ? 0 : visible.findIndex((item) => item.id === options.cursor) + 1;
  if (options.cursor !== undefined && start === 0) throw new Error("unknown notification cursor");
  const page = visible.slice(start, start + limit);

  return notificationPageSchema.parse({
    items: page,
    unread,
    nextCursor: start + limit < visible.length ? page[page.length - 1]!.id : null,
  });
}

/**
 * 「全部已读」把水位推到当前最新一条；单条已读只往集合里加 id。
 * 水位前移后集合里早于水位的 id 就没用了，顺手丢掉，免得无限增长。
 */
export function markRead(
  candidates: readonly NotificationCandidate[],
  state: NotificationReadState,
  ids: readonly string[] | null,
  now: string,
): NotificationReadState {
  const parsedState = notificationReadStateSchema.parse(state);
  if (ids === null) {
    return notificationReadStateSchema.parse({ notificationsReadAt: now, notificationsReadIds: [] });
  }
  const known = new Set(candidates.map((candidate) => candidate.id));
  const unknown = ids.filter((id) => !known.has(id));
  // 标记一条不存在的通知说明前端拿的是过期列表，宁可报错也不静默吞掉。
  if (unknown.length > 0) throw new Error(`unknown notification id: ${unknown[0]}`);
  const readAt = parsedState.notificationsReadAt;
  const merged = new Set([...parsedState.notificationsReadIds, ...ids]);
  const stillNeeded = [...merged].filter((id) => {
    if (readAt === null) return true;
    const candidate = candidates.find((item) => item.id === id);
    return candidate === undefined || Date.parse(candidate.at) > Date.parse(readAt);
  });
  return notificationReadStateSchema.parse({
    notificationsReadAt: readAt,
    notificationsReadIds: stillNeeded,
  });
}

/** me/counts.notificationsUnread 走这里，保证与通知流同源同值。 */
export function countUnread(
  candidates: readonly NotificationCandidate[],
  state: NotificationReadState,
): number {
  return candidates.filter((candidate) => !isRead(candidate, state)).length;
}
