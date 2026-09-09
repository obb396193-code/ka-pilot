import { TaskDetailRepository, buildTaskDetailReadiness } from "@ka/db";
import {
  TASK_DETAIL_TABS, computeTaskPacing, deriveSopProgressFromStage, metricValue,
  shanghaiTaskBusinessDate, taskDetailSchema,
} from "@ka/domain";
import type { Pool } from "pg";

import { guardedRoute, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

// v1.5.1 ② `GET /tasks/:id`（D5）。八页签的 overview 读；其余签由各自端点供数。
const TASK_DETAIL = /^\/api\/v1\/tasks\/([^/]{1,128})$/;

const ratio = (numerator: number | null, denominator: number | null) =>
  numerator === null || denominator === null || denominator === 0
    ? { value: null, state: "undefined" as const }
    : { value: numerator / denominator, state: "finite" as const };

export function createTaskDetailRoutes(pool: Pool): R014Route[] {
  const repository = new TaskDetailRepository(pool);

  return [
    guardedRoute((pathname) => TASK_DETAIL.test(pathname), async (context) => {
      requireMethod(context.request, ["GET"]);
      const taskId = decodeURIComponent(TASK_DETAIL.exec(context.url.pathname)![1]!);
      const businessDate = shanghaiTaskBusinessDate(new Date());
      const facts = await repository.facts(context.auth, taskId, businessDate);

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
          // 以下没有数据源，一律 null：窗口口径要 PlatformWindowQuery（R-010a1），
          // 预算三项要 task_budget_history（014）。**不拿任务级 budget 或日消耗凑。**
          cost: null,
          costStatus: null,
          costStatusReason: null,
          onTarget: null,
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
