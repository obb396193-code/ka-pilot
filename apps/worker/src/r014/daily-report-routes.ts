import { DailyReportRepository } from "@ka/db";
import {
  DAILY_REPORT_MODULES, dailyReportSchema, divideMetricValues, metricValue, shanghaiTaskBusinessDate,
  unsupportedModule, type DailyReportModule,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

/**
 * v1.5 1.8 `GET /reports/daily?date=`（D7）。渲染先只出 JSON，PDF/推送后续。
 *
 * 十个维度模块**当前一律 `unsupported: true`**：fixture 把它们的 `rows` 冻成了空数组，
 * 行结构没定义。编一套出来等 arch 冻了就要推倒重来，前端还会先按错的形状写。已回抛 arch。
 */
const DIMENSION_MODULES = [
  "dim_task", "dim_biz", "dim_account", "dim_agent", "dim_resource_position",
  "dim_bid_tool", "dim_ubp", "dim_deduction", "deduction_analysis", "cost_tiers",
] as const;

export function createDailyReportRoutes(pool: Pool): R014Route[] {
  const repository = new DailyReportRepository(pool);

  return [
    guardedRoute((pathname) => pathname === "/api/v1/reports/daily", async (context) => {
      requireMethod(context.request, ["GET"]);
      const requested = context.url.searchParams.get("date");
      const date = requested ?? shanghaiTaskBusinessDate(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new R014HttpError(400, "INVALID_REQUEST", "date must be YYYY-MM-DD");
      }
      const facts = await repository.facts(context.auth, date);

      const cashCost = metricValue(facts.cards.cashCost);
      const realConversion = metricValue(facts.cards.realConversion);
      const summary: DailyReportModule = {
        key: "executive_summary",
        title: DAILY_REPORT_MODULES[0].title,
        cards: {
          cost: metricValue(facts.cards.cost),
          cashCost,
          realConversion,
          // 现金 CPA = 现金消耗 / 真实转化；分母为 0 时是 infinite/undefined，不是 0。
          cashCpa: divideMetricValues(cashCost, realConversion),
          onTargetRate: divideMetricValues(
            metricValue(facts.cards.onTargetAccounts),
            metricValue(facts.cards.determinableAccounts === 0 ? null : facts.cards.determinableAccounts),
          ),
          costSpace: metricValue(facts.cards.costSpace),
        },
        anomalies: facts.anomalies,
      };

      // 健康度按未处理工作项的最高等级定档；没有未处理项才是 ok，不默认健康。
      const health: DailyReportModule = {
        key: "health",
        title: "健康度",
        status: facts.highestOpenSeverity === "P0" ? "p0_pending"
          : facts.highestOpenSeverity === "P1" ? "p1_pending"
            : facts.highestOpenSeverity === "P2" ? "p2_pending" : "ok",
      };

      const modules: DailyReportModule[] = DAILY_REPORT_MODULES.map((definition) => {
        if (definition.key === "executive_summary") return summary;
        if (definition.key === "health") return health;
        if (definition.key === "overview") return { key: "overview", title: definition.title, trend: [] };
        return unsupportedModule(definition.key);
      });
      // 上面那句必须覆盖十个维度模块；漏一个就说明常量表和 fixture 对不上了。
      if (modules.filter((module) => "unsupported" in module).length !== DIMENSION_MODULES.length) {
        throw new R014HttpError(500, "INTERNAL_ERROR", "daily report module table is inconsistent");
      }

      sendData(
        context.response,
        dailyReportSchema.parse({
          schema: "daily-report/v1",
          date,
          role: context.auth.role,
          dataAsOf: facts.dataAsOf,
          modules,
          // 布尔只表示「这个动作可用」，不表示已经做过（v1.7.4 G8）。
          // PDF 渲染与钉钉推送本批未接 → 都是 false，不谎称可用。
          actions: { pushDingtalk: false, exportPdf: false },
          delivery: facts.delivery,
        }),
        context.requestId, context.maxResponseBytes,
      );
    }),
  ];
}
