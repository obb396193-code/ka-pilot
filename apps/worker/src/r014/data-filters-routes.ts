import {
  AccountDimensionEvidenceRepository, AccountDimensionRuleRepository,
  DashboardAccountCostRepository, DashboardAccountDaysRepository, withSemanticReadSnapshot,
} from "@ka/db";
import {
  accountDimensionRuleSchema, buildDashboardFilterOptions, dashboardFiltersSchema,
  resolveNamedDimensions, type FilterOptionDay,
} from "@ka/domain";
import type { Pool } from "pg";

import { R014HttpError, guardedRoute, requireMethod, sendData } from "./http.js";
import type { R014Route } from "./routes.js";

/**
 * v1.9.27 ④ / Q-041 ①：`GET /api/v1/data/filters` 级联选项。
 *
 * 挂在 R-014 路由表里而不是 data 壳层的 if 链：壳层已经把不认识的路径交给
 * `findR014Route`，走这边能直接拿到**会话批准过的 scope tuple**，
 * 账户集合就永远来自会话而不是浏览器参数——这正是这个端点最容易出事的地方。
 *
 * 团队空间（ka-data 源）这版**明确不支持**：ka-data 的筛选选项要走它自己的取数口径，
 * 拿个人源那套算出来的选项去筛团队数据，两边口径对不上。回 503 说清楚，
 * 不回一个空列表假装「没有可选项」（Q-041 ⑧ 再接）。
 */
const PATH = "/api/v1/data/filters";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MEDIA = /^[A-Z0-9_]{1,32}$/;
/** 窗口上限与看板其它读路径一致：31 天 × 账户数要落在仓储的行预算内。 */
const MAX_WINDOW_DAYS = 92;

function listParam(url: URL, name: string): string[] | undefined {
  // `optimizer[]=a&optimizer[]=b` 与 `optimizer=a&optimizer=b` 都收：前端两种写法都出现过。
  const values = [...url.searchParams.getAll(`${name}[]`), ...url.searchParams.getAll(name)]
    .flatMap((value) => value.split(",")).map((value) => value.trim()).filter((value) => value.length > 0);
  return values.length === 0 ? undefined : [...new Set(values)];
}

export function createDataFiltersRoutes(pool: Pool): R014Route[] {
  return [
    guardedRoute((pathname) => pathname === PATH, async (context) => {
      requireMethod(context.request, ["GET"]);
      const auth = context.auth;
      if (auth.workspaceKind === "team") {
        throw new R014HttpError(503, "SOURCE_UNAVAILABLE",
          "Cascading filter options are not available for the team (ka-data) source yet");
      }
      const url = context.url;
      const dateFrom = url.searchParams.get("window_from") ?? url.searchParams.get("dateFrom") ?? "";
      const dateTo = url.searchParams.get("window_to") ?? url.searchParams.get("dateTo") ?? "";
      if (!DATE.test(dateFrom) || !DATE.test(dateTo) || dateFrom > dateTo) {
        throw new R014HttpError(400, "INVALID_REQUEST", "window_from and window_to are required");
      }
      const span = (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000 + 1;
      if (span > MAX_WINDOW_DAYS) {
        throw new R014HttpError(400, "INVALID_REQUEST", `window must not exceed ${MAX_WINDOW_DAYS} days`);
      }
      const media = url.searchParams.get("media");
      if (media !== null && !MEDIA.test(media)) {
        throw new R014HttpError(400, "INVALID_REQUEST", "media is malformed");
      }
      const filters = dashboardFiltersSchema.safeParse({
        ...(listParam(url, "optimizer") === undefined ? {} : { optimizer: listParam(url, "optimizer") }),
        ...(listParam(url, "biz") === undefined ? {} : { biz: listParam(url, "biz") }),
        ...(listParam(url, "task_id") === undefined ? {} : { task_id: listParam(url, "task_id") }),
        ...(listParam(url, "resource_position") === undefined
          ? {} : { resource_position: listParam(url, "resource_position") }),
      });
      if (!filters.success) throw new R014HttpError(400, "INVALID_REQUEST", "filters are malformed");

      // 账户集合**只**来自会话批准的 tuple；media 参数只能在其中再收窄，不能扩。
      const accounts = auth.scope.kind === "explicit_accounts"
        ? auth.scope.accounts
          .filter((account) => media === null || account.media === media)
          .map((account) => ({ media: account.media, accountId: account.accountId }))
        : [];
      if (accounts.length === 0) {
        sendData(context.response, buildDashboardFilterOptions([], filters.data),
          context.requestId, context.maxResponseBytes, { accountsInScope: 0 });
        return;
      }

      const options = await withSemanticReadSnapshot(pool, async (connection) => {
        // 元数据、解析证据与花费必须来自**同一个快照连接**：分开读会拿到不同时刻的库，
        // 于是选项里出现「有花费但当天还没归属」这种自相矛盾的行。
        const days = await new DashboardAccountDaysRepository(connection)
          .load({ workspaceId: auth.workspaceId, accounts, dateFrom, dateTo });
        const evidenceScope = { workspaceId: auth.workspaceId, accounts };
        const evidence = await new AccountDimensionEvidenceRepository(connection).load(evidenceScope);
        const rules = await new AccountDimensionRuleRepository(connection).load(evidenceScope);
        const costs = await new DashboardAccountCostRepository(connection)
          .load({ workspaceId: auth.workspaceId, accounts, dateFrom, dateTo });

        const key = (row: { media: string; accountId: string }) => `${row.media}:${row.accountId}`;
        const rulesByKey = new Map(rules.map((row) => [key(row), accountDimensionRuleSchema.parse(row)]));
        const labels = new Map<string, ReturnType<typeof resolveNamedDimensions>>();
        for (const row of evidence) {
          const rule = rulesByKey.get(key(row));
          // 解析行挂在哪版规则上就用哪版：拿最新规则去解释旧解析结果，标签会凭空变。
          if (rule === undefined || row.parse === null || rule.ruleVersion !== row.parse.ruleVersion) continue;
          try {
            labels.set(key(row), resolveNamedDimensions({
              segments: row.parse.segments, override: row.parse.override ?? {},
              nameMatches: row.parse.nameMatches, ruleMappings: rule.mappings,
            }));
          } catch { /* 解析证据坏了就当这个账户没标签，不拿半份结果冒充 */ }
        }
        const costByKey = new Map(costs.map((row) => [`${row.media}:${row.accountId}:${row.ds}`, row.cost]));
        const rows: FilterOptionDay[] = days.map((day) => {
          const named = labels.get(key(day));
          return {
            media: day.media, accountId: day.accountId, ds: day.ds,
            optimizer: named?.optimizer.value ?? null,
            biz: day.bizName,
            taskId: day.taskId,
            taskName: day.taskName,
            resourcePosition: named?.placement.value ?? null,
            // 这一天没有 canonical 行（或批次失败被屏蔽）→ null，不是 0。
            cost: costByKey.get(`${day.media}:${day.accountId}:${day.ds}`) ?? null,
          };
        });
        return buildDashboardFilterOptions(rows, filters.data);
      });

      sendData(context.response, options, context.requestId, context.maxResponseBytes,
        { accountsInScope: accounts.length, window: { from: dateFrom, to: dateTo } });
    }),
  ];
}
