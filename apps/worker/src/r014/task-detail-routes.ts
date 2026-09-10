import { TaskDetailRepository, TaskManageRepository, buildTaskDetailReadiness } from "@ka/db";
import {
  TASK_DETAIL_TABS, computeTaskPacing, deriveSopProgressFromStage, metricValue,
  shanghaiTaskBusinessDate, taskBatchSaveRequestSchema, taskDetailSchema,
  type ApprovedWorkspaceAuthContext,
} from "@ka/domain";
import type { Pool } from "pg";

import { createPlatformWindowQuery } from "../data/platform-window-query.js";
import { R014HttpError, guardedRoute, readJsonBody, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.5.1 ② `GET /tasks/:id`（D5）。八页签的 overview 读；其余签由各自端点供数。
// v1.9.28 加 `PATCH`（任务管理视图改四个字段）与 `POST /tasks/batch-save`（整类保存）。
// **`batch-save` 长得就像一个 task_id**：详情路由先匹配上的话整条端点会变成 405。
// 靠的是「batch-save 那条排在数组前面」（findR014Route 取第一个匹配），
// 正则里不写零宽断言——三份路径扫描绊线（r014/r010 的 BFF 覆盖、访客写闸）都是按
// 「捕获组 → :p」抹平的，断言会被它们抹成一段假路径，换来一串假红。
// 顺序这件事本身由 task-manage.test.ts 的第一条用例钉住，改顺序就会红。
const TASK_DETAIL = /^\/api\/v1\/tasks\/([^/]{1,128})$/;
const TASK_BATCH_SAVE = "/api/v1/tasks/batch-save";

const ratio = (numerator: number | null, denominator: number | null) =>
  numerator === null || denominator === null || denominator === 0
    ? { value: null, state: "undefined" as const }
    : { value: numerator / denominator, state: "finite" as const };

/**
 * D5b-2：窗口口径块。arch 采 Codex P-168 的更正——`PlatformWindowQuery` 已有
 * 「批准 tuple + taskId + window」的个人源入口，所以 cost 四项现在就能接
 * （`budget*` 三项仍等 014 `task_budget_history`）。
 *
 * 窗口取本月至业务日（fixture `overview-v151` 就是 month_to_date）。
 * 传的账户是**会话 scope 的 tuple**，窗口查询内部再按 taskId 收敛 —— 与 Q-020 同口径，
 * 不会把没授权账户的消耗算进来。
 */
function monthToDate(businessDate: string): { from: string; to: string; preset: "month_to_date" } {
  return { from: `${businessDate.slice(0, 7)}-01`, to: businessDate, preset: "month_to_date" };
}

export function createTaskDetailRoutes(pool: Pool): R014Route[] {
  const repository = new TaskDetailRepository(pool);
  const manage = new TaskManageRepository(pool);
  const windowQuery = createPlatformWindowQuery(pool);

  /**
   * 只出源里真有的六项。`projectedWindowCashCpa` / `affordableDailyCashCpa`
   * **窗口源不提供**（它们是预估，不是观测），所以照 undefined 出，不自己算一个像模像样的数。
   */
  async function costWindow(
    auth: ApprovedWorkspaceAuthContext,
    taskId: string,
    businessDate: string,
  ): Promise<{
    cost: Record<string, unknown> | null; costStatus: "green" | "yellow" | "red" | null;
    costStatusReason: string | null; onTarget: boolean | null;
  }> {
    const accounts = auth.scope.kind === "explicit_accounts"
      ? auth.scope.accounts.map((account) => ({ media: account.media, accountId: account.accountId }))
      : [];
    // 团队空间没有 tuple 列表可传；窗口源是个人源入口，团队空间照旧不出这块。
    if (accounts.length === 0) return { cost: null, costStatus: null, costStatusReason: null, onTarget: null };

    const period = monthToDate(businessDate);
    let result;
    try {
      result = await windowQuery.summary({
        workspaceId: auth.workspaceId, accounts, window: period, taskId,
      });
    } catch {
      // 源在但算不出来 → 503（v1.9 §一「缺源两层政策」），不静默出 null 冒充「没有数据」。
      throw new R014HttpError(503, "SOURCE_UNAVAILABLE", "The window metric source is not available");
    }

    const { metrics, assessment } = result.row;
    return {
      cost: {
        window: result.window,
        cost: metrics.cost,
        cashCost: metrics.cashCost,
        cashCpa: metrics.ratios.cashCpa,
        realCpa: metrics.ratios.realCpa,
        costSpace: metrics.costSpace,
        // 这两项是预估口径，窗口源没有；**不自己算一个像模像样的数**。
        projectedWindowCashCpa: { value: null, state: "undefined" as const },
        affordableDailyCashCpa: { value: null, state: "undefined" as const },
      },
      costStatus: assessment.costStatus,
      costStatusReason: assessment.costStatusReason,
      onTarget: assessment.onTarget,
    };
  }

  return [
    /**
     * v1.9.28：整类保存。**全部成功才写**——一半写进去一半没写，页面上看不出是哪一半，
     * 用户只会再点一次保存，把成功的那半又写一遍。
     */
    guardedRoute((pathname) => pathname === TASK_BATCH_SAVE, async (context) => {
      requireMethod(context.request, ["POST"]);
      const body = await readJsonBody(context.request, 262_144);
      const parsed = taskBatchSaveRequestSchema.safeParse(body);
      if (!parsed.success) throw new R014HttpError(400, "INVALID_REQUEST", "items must be a non-empty array");
      const result = await manage.batchSave(
        context.auth, parsed.data.items as { task_id: string }[], shanghaiTaskBusinessDate(new Date()));
      if ("failed" in result) {
        // 契约 v1.9.28：失败清单进 details.failed[]，调用方要知道是哪几条、为什么。
        throw new R014HttpError(400, "INVALID_REQUEST", "batch save rejected", {
          failed: result.failed.map((entry) => ({
            task_id: entry.taskId, code: entry.code, message: entry.message,
          })),
        });
      }
      sendData(context.response, { saved: result.saved }, context.requestId, context.maxResponseBytes);
    }),

    guardedRoute((pathname) => TASK_DETAIL.test(pathname), async (context) => {
      const method = requireMethod(context.request, ["GET", "PATCH"]);
      const taskId = decodeURIComponent(TASK_DETAIL.exec(context.url.pathname)![1]!);
      if (method === "PATCH") {
        const body = await readJsonBody(context.request, 32_768);
        sendData(
          context.response,
          await manage.patch(context.auth, taskId, body, shanghaiTaskBusinessDate(new Date())),
          context.requestId, context.maxResponseBytes,
        );
        return;
      }
      const businessDate = shanghaiTaskBusinessDate(new Date());
      const facts = await repository.facts(context.auth, taskId, businessDate);

      const window = await costWindow(context.auth, taskId, businessDate);

      const readiness = buildTaskDetailReadiness(facts);
      const pacing = facts.task.periodStart === null || facts.task.periodEnd === null
        ? null
        : computeTaskPacing({
          periodStart: facts.task.periodStart,
          periodEnd: facts.task.periodEnd,
          asOf: businessDate,
          targetVolume: facts.task.targetVolume,
          completedVolume: facts.completedVolume,
          budget: facts.task.budget,
          recentDailyVolumes: facts.recentDailyVolumes,
        });

      // 阻塞项与下一步只来自真实的 open 工作项与就绪缺项（v1.5.1 ② 明写「不生成」）。
      const blockers = [
        ...facts.openWorkItems.map((item) => ({
          kind: "work_item" as const, ref: item.id, title: item.title, severity: item.severity,
        })),
        ...Object.entries(readiness)
          .filter(([key, entry]) => key !== "overall" && !(entry as { ready: boolean }).ready)
          .flatMap(([key, entry]) => (entry as { missing: string[] }).missing.map((missing) => ({
            kind: "readiness" as const, ref: key, title: missing, severity: null,
          }))),
      ];

      const detail = taskDetailSchema.parse({
        task: {
          taskId: facts.task.taskId,
          taskName: facts.task.taskName,
          bizName: facts.task.bizName,
          status: facts.task.status,
          period: facts.task.periodStart === null || facts.task.periodEnd === null
            ? null
            : { start: facts.task.periodStart, end: facts.task.periodEnd },
          owner: facts.task.owner,
          budget: metricValue(facts.task.budget),
        },
        overview: {
          targetVolume: metricValue(facts.task.targetVolume),
          achieved: metricValue(facts.completedVolume),
          achievementRate: ratio(facts.completedVolume, facts.task.targetVolume),
          timeProgress: pacing === null ? { value: null, state: "undefined" } : pacing.timeProgress,
          pacing: pacing === null ? null : { ...pacing },
          anomalySummary: facts.anomalySummary,
          assessmentPrice: facts.assessmentPrice,
          stage: facts.stage,
          readiness,
          // 有绑定 run 时步骤由 run 事件供数（R-010b 的域）；没绑定就按 stage 推、不带时间戳。
          sopProgress: facts.sopRunId === null ? deriveSopProgressFromStage(facts.stage.value) : null,
          blockers,
          nextActions: blockers.slice(0, 3).map(({ kind, ref, title }) => ({ kind, ref, title })),
          ...window,
          // 预算三项要 task_budget_history（014，Codex）。**不拿任务级 budget 或日消耗凑。**
          budgetUsageRate: null,
          budgetUsageDate: null,
          dailyBudgetCap: null,
        },
        tabs: [...TASK_DETAIL_TABS],
      });
      sendData(context.response, detail, context.requestId, context.maxResponseBytes);
    }),
  ];
}
