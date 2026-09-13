import {
  AccountDimensionEvidenceRepository, AccountDimensionRuleRepository, type SemanticReadConnection,
} from "@ka/db";
import { accountDimensionRuleSchema, resolveNamedDimensions, segmentDimensionKey } from "@ka/domain";

/**
 * 账户的**昵称清洗标签**：命名维度（optimizer/goal/placement…）与任意清洗段（`segment:<key>`）。
 *
 * v1.9.34 ⑩（Q-041 ⑦）老板要「每个清洗字段都能拿来做分析和透视」，透视这条路由此而来。
 *
 * ⚠️ `platform-dimension-query.ts` 目前**另有一份同样的解析**（同样的规则版本核对、同样的
 * `resolveNamedDimensions`），只是它还要带出 `source/sources` 所以形状不同。两份不收敛的后果是
 * 「透视里按优化师分组是一个结果、维度查询里是另一个」——这种分歧不会有任何东西报错。
 * 收敛动作会改动维度查询的发出形状（arch 刚为 `source,sources` 热修过前端镜像），另笔报备后做。
 *
 * 两条不猜的规矩：
 * - **解析行挂在哪版规则上就用哪版解释**；拿最新规则去解释旧解析结果，标签会凭空变。
 * - 解析证据坏了就当这个账户没有标签（全 null），不拿半份结果冒充——
 *   分组里多一个凭空出现的桶，比少一个桶更难发现。
 */
export type AccountLabels = Map<string, Record<string, string | null>>;

export const accountLabelKey = (row: { media: string; accountId: string }): string =>
  `${row.media}:${row.accountId}`;

export async function loadAccountLabels(
  connection: SemanticReadConnection,
  input: { workspaceId: string; accounts: readonly { media: string; accountId: string }[] },
): Promise<AccountLabels> {
  const labels: AccountLabels = new Map();
  if (input.accounts.length === 0) return labels;
  const scope = { workspaceId: input.workspaceId, accounts: input.accounts };
  const evidence = await new AccountDimensionEvidenceRepository(connection).load(scope);
  const rules = await new AccountDimensionRuleRepository(connection).load(scope);
  const rulesByKey = new Map(rules.map((row) => [accountLabelKey(row), accountDimensionRuleSchema.parse(row)]));

  for (const row of evidence) {
    const rule = rulesByKey.get(accountLabelKey(row));
    if (rule === undefined || row.parse === null || rule.ruleVersion !== row.parse.ruleVersion) continue;
    const entry: Record<string, string | null> = {};
    try {
      const named = resolveNamedDimensions({
        segments: row.parse.segments, override: row.parse.override ?? {},
        nameMatches: row.parse.nameMatches, ruleMappings: rule.mappings,
      });
      for (const [dimension, value] of Object.entries(named)) {
        entry[dimension] = (value as { value: string | null }).value;
      }
    } catch { continue; }
    // 段值来自解析行本身（人工覆盖优先），不经过 mapsTo——`segment:<key>` 问的就是
    // 「这一段写了什么」，而不是「这一段落到哪个维度」。待确认段照样能看，但它不进维度。
    const segments = row.parse.segments as Record<string, { value?: unknown } | undefined>;
    const override = (row.parse.override ?? {}) as Record<string, unknown>;
    for (const [key, segment] of Object.entries(segments)) {
      const manual = override[key];
      const value = typeof manual === "string" ? manual
        : typeof segment?.value === "string" ? segment.value : null;
      entry[`segment:${key}`] = value === "" ? null : value;
    }
    labels.set(accountLabelKey(row), entry);
  }
  return labels;
}

/** 账户日事实自带的三维，不用查标签。 */
const FACT_DIMENSIONS: readonly string[] = ["account", "task", "biz"];
/**
 * 标签能产出的命名维度——与 `resolveNamedDimensions` 的返回键**一一对应**。
 * `dimensionTypeSchema` 里还有 `ubp`/`bid_tool`/`agent_type` 等，但没有任何解析器产出它们：
 * 列进来只会让调用方以为换个维度就能用。
 */
export const LABEL_DIMENSIONS: readonly string[] = ["optimizer", "goal", "placement"];
/** 注册表与透视查询共用的可分组清单（段另算，见 `groupableDimension`）。 */
export const FIXED_DIMENSIONS: readonly string[] = [...FACT_DIMENSIONS, ...LABEL_DIMENSIONS];

/** 这个维度是不是要靠昵称标签才能分组（固定三维不用）。 */
export function needsAccountLabels(dimension: string): boolean {
  return LABEL_DIMENSIONS.includes(dimension) || segmentDimensionKey(dimension) !== null;
}

/**
 * 这个维度到底能不能分组。**透视查询自己也要问一遍**，不能只靠注册表挡：
 * 注册表管的是 HTTP 入口，查询类还被集成测试、脚本直接构造——
 * 少了这道闸，一个没人解析的维度会静悄悄变成「所有账户都归同一个空桶」，
 * 页面上看着像一份正常的一行透视表。
 */
export function groupableDimension(dimension: string): boolean {
  return FIXED_DIMENSIONS.includes(dimension) || segmentDimensionKey(dimension) !== null;
}
