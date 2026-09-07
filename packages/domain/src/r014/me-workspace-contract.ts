import { z } from "zod";

import type { RatioValue } from "../types.js";

// v1.7.1 me/counts（侧栏 badge 与铃铛的唯一计数源）+ v1.7.4 G9 me/workload。
// 两者都是**整数计数**的冻结 DTO，没有三态可用——所以「源表还不存在」不能表达成 0。
// 处理方式：仓储给 parts（缺源=null），sealMeCounts 把缺口显式抛出来交给调用方决定，
// 绝不在这一层把 null 悄悄变成 0。

export const meCountsSchema = z.object({
  workItems: z.object({
    open: z.number().int().nonnegative(),
    p0: z.number().int().nonnegative(),
    p1: z.number().int().nonnegative(),
    opportunity: z.number().int().nonnegative(),
  }).strict(),
  approvalsToApprove: z.number().int().nonnegative(),
  dispatchesReceived: z.number().int().nonnegative(),
  runsWaitingConfirmation: z.number().int().nonnegative(),
  notificationsUnread: z.number().int().nonnegative(),
  changesetsDraft: z.number().int().nonnegative(),
}).strict();
export type MeCounts = z.infer<typeof meCountsSchema>;

/** 仓储的中间产物：`null` = 该源当前不可得（表还没建 / 迁移未落），不是 0。 */
export interface MeCountsParts {
  workItems: MeCounts["workItems"] | null;
  approvalsToApprove: number | null;
  dispatchesReceived: number | null;
  runsWaitingConfirmation: number | null;
  notificationsUnread: number | null;
  changesetsDraft: number | null;
}

export type SealResult =
  | { complete: true; counts: MeCounts }
  | { complete: false; missing: string[] };

/**
 * 只有每一项都拿到了才给出冻结 DTO；否则回报缺哪些源。
 * 补 0 会让侧栏显示「没有待办」——那是最坏的一种假数据：用户据此不去处理。
 */
export function sealMeCounts(parts: MeCountsParts): SealResult {
  const missing = (Object.keys(parts) as (keyof MeCountsParts)[]).filter((key) => parts[key] === null);
  if (missing.length > 0) return { complete: false, missing: missing.sort() };
  return { complete: true, counts: meCountsSchema.parse(parts) };
}

/* ── v1.7.4 G9 me/workload ────────────────────────────────────────── */

const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict();

export const loadScoreSourceSchema = z.enum(["not_configured", "formula", "manual"]);

export const meWorkloadSchema = z.object({
  tasks: z.object({
    owned: z.number().int().nonnegative(),
    participating: z.number().int().nonnegative(),
  }).strict(),
  accounts: z.object({
    owned: z.number().int().nonnegative(),
    watching: z.number().int().nonnegative(),
  }).strict(),
  pending: z.object({
    workItems: z.number().int().nonnegative(),
    approvals: z.number().int().nonnegative(),
    dispatches: z.number().int().nonnegative(),
    runsWaitingConfirmation: z.number().int().nonnegative(),
  }).strict(),
  oncall: z.object({
    today: z.boolean(),
    next: z.object({ at: z.string().min(1), role: z.string().min(1) }).strict().nullable(),
  }).strict(),
  loadScore: z.object({
    value: ratioValueSchema,
    source: loadScoreSourceSchema,
    formula: z.string().min(1).nullable(),
  }).strict(),
}).strict().superRefine((value, context) => {
  // G9 铁律：负载分公式老板没定 → 必须 undefined + not_configured，**不造分**。
  const { value: score, source, formula } = value.loadScore;
  if (source === "not_configured" && (score.state !== "undefined" || score.value !== null || formula !== null)) {
    context.addIssue({
      code: "custom",
      message: "an unconfigured load score must stay undefined instead of being invented",
      path: ["loadScore"],
    });
  }
  if (source === "formula" && formula === null) {
    context.addIssue({ code: "custom", message: "a formula-sourced load score must name its formula", path: ["loadScore", "formula"] });
  }
});
export type MeWorkload = z.infer<typeof meWorkloadSchema>;

/** 公式未定时的唯一合法负载分。 */
export const UNCONFIGURED_LOAD_SCORE: MeWorkload["loadScore"] = {
  value: { value: null, state: "undefined" } as RatioValue,
  source: "not_configured",
  formula: null,
};
