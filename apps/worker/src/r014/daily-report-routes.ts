import { AccountNameParseRepository, DailyReportRepository } from "@ka/db";
import {
  DAILY_REPORT_MODULES, UNLABELLED_DIMENSION, dailyReportSchema, divideMetricValues,
  groupRowsByDimension, metricValue, shanghaiTaskBusinessDate, unsupportedModule,
  type DailyReportModule,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

/**
 * v1.5 1.8 `GET /reports/daily?date=`（D7）。渲染先只出 JSON，PDF/推送后续。
 *
 * v1.9.2 裁决后：`dim_task/dim_biz/dim_account` 从 canonical 日表按维度聚合出行
 * （与六卡同源）。其余七个模块仍 `unsupported: true` —— 那是「源没接」，
 * 不是「查过了没有数据」，两者在页面上必须分得开。
 */
const SOURCED_DIMENSIONS = ["dim_task", "dim_biz", "dim_account"] as const;

/**
 * v1.9.2：这三个模块读 `account_name_parses`，按账户的解析维度归并账户行
 * （**不重算指标**，所以与六卡、dim_account 天然同源）。
 *
 * `dim_ubp` **不在此列**：它的标题就是「UBP」，而 v1.8 命名规范的十个维度里
 * 没有叫 UBP 的段。猜一个映射上去就是给日报贴错标签，已回抛 arch。
 */
const PARSED_DIMENSION_MODULES = {
  dim_agent: "agentType",
  dim_resource_position: "placement",
  dim_bid_tool: "bidMode",
} as const;

const UNSUPPORTED_DIMENSIONS = [
  "dim_ubp", "dim_deduction", "deduction_analysis", "cost_tiers",
] as const;

/** F-Q019-1：回显**请求的** role，不是身份角色。缺省 optimizer。 */
const REPORT_ROLES = ["optimizer", "lead", "exec"] as const;
function requestedRole(raw: string | null): (typeof REPORT_ROLES)[number] {
  if (raw === null) return "optimizer";
  const found = REPORT_ROLES.find((role) => role === raw);
  // 认不出的 role 直接拒，不悄悄当 optimizer —— 那会让调用方以为自己拿到的是 exec 视图。
  if (found === undefined) throw new R014HttpError(400, "INVALID_REQUEST", "role must be optimizer, lead or exec");
  return found;
}

export function createDailyReportRoutes(pool: Pool): R014Route[] {
  const repository = new DailyReportRepository(pool);
  const parses = new AccountNameParseRepository(pool);

  return [
    guardedRoute((pathname) => pathname === "/api/v1/reports/daily", async (context) => {
      requireMethod(context.request, ["GET"]);
      const requested = context.url.searchParams.get("date");
      const date = requested ?? shanghaiTaskBusinessDate(new Date());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new R014HttpError(400, "INVALID_REQUEST", "date must be YYYY-MM-DD");
      }
      const role = requestedRole(context.url.searchParams.get("role"));
      const facts = await repository.facts(context.auth, date);

      // 维度值取自解析表；解析读失败不该让整张日报 500，拿不到就全部归「未标注」。
      let dimensionOf = new Map<string, Record<string, { value: string | null }>>();
      try {
        dimensionOf = await parses.dimensionsFor(
          context.auth,
          facts.dimensions.account.map((row) => ({ media: row.media!, accountId: row.accountId! })),
        ) as never;
      } catch {
        dimensionOf = new Map();
      }

      // F-Q023-1 归属链：绑定任务的 biz_name → 账户昵称解析出的业务段 → 未标注业务。
      let parsedBiz = new Map<string, string>();
      try {
        parsedBiz = await parses.bizFor(
          context.auth,
          facts.dimensions.account.map((row) => ({ media: row.media!, accountId: row.accountId! })),
        );
      } catch {
        parsedBiz = new Map();
      }

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
        if (definition.key === "overview") {
          // F-Q019-3：截至 date 的 7 个点，缺数日 null 不跳日不补 0。
          return { key: "overview", title: definition.title, trend: facts.trend };
        }
        if (definition.key === "dim_task") {
          return { key: definition.key, title: definition.title, rows: facts.dimensions.task, unsupported: false };
        }
        if (definition.key === "dim_biz") {
          // 走归并而不是直接用 SQL 那份：这样任务没填 biz_name 时能回落到昵称解析的业务段，
          // 且与 dim_account、六卡同源（同一批账户行合并出来的）。
          const rows = groupRowsByDimension(facts.dimensions.account, (row) =>
            facts.bizByAccount[row.key] ?? parsedBiz.get(row.key) ?? null);
          return {
            key: definition.key, title: definition.title, unsupported: false,
            rows: rows.map((row) => (row.key === UNLABELLED_DIMENSION
              ? { ...row, key: "未标注业务", label: "未标注业务" } : row)),
          };
        }
        if (definition.key === "dim_account") {
          return { key: definition.key, title: definition.title, rows: facts.dimensions.account, unsupported: false };
        }
        const parsedKey = PARSED_DIMENSION_MODULES[definition.key as keyof typeof PARSED_DIMENSION_MODULES];
        if (parsedKey !== undefined) {
          const rows = groupRowsByDimension(facts.dimensions.account, (row) =>
            dimensionOf.get(row.key)?.[parsedKey]?.value ?? null);
          return { key: definition.key, title: definition.title, rows, unsupported: false };
        }
        return unsupportedModule(definition.key);
      });
      // 有源的三个必须出行、其余七个必须还是 unsupported；数字对不上就是常量表和 fixture 脱节了。
      if (modules.filter((module) => "unsupported" in module && module.unsupported === true).length
        !== UNSUPPORTED_DIMENSIONS.length) {
        throw new R014HttpError(500, "INTERNAL_ERROR", "daily report module table is inconsistent");
      }
      if (SOURCED_DIMENSIONS.some((key) => !modules.some((module) => module.key === key))) {
        throw new R014HttpError(500, "INTERNAL_ERROR", "daily report module table is inconsistent");
      }

      sendData(
        context.response,
        dailyReportSchema.parse({
          schema: "daily-report/v1",
          date,
          role,
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
