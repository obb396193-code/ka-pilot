import {
  AccountLabelHistoryRepository, type AccountLabelHistoryRow, type SemanticReadConnection,
} from "@ka/db";
import {
  pickAccountLabelBasis, resolveNamedDimensions, resolveSegmentDimension, segmentDimensionKey,
} from "@ka/domain";

/**
 * 账户的**昵称清洗标签**：命名维度（optimizer/goal/placement…）与任意清洗段（`segment:<key>`）。
 *
 * v1.9.34 ⑩（Q-041 ⑦）老板要「每个清洗字段都能拿来做分析和透视」，透视这条路由此而来。
 *
 * v1.9.49 ①（Q-044 ③）：标签**按业务日**取。账户 9-10 从张三改名李四，看 9 月上旬就该归张三——
 * 原来只读最新一行，历史窗口跟着今天的归属走，而且看不出来。选哪一行只由 domain 的
 * `pickAccountLabelBasis` 决定，透视、团队维度都走这里，不各自选。
 *
 * 两条不猜的规矩：
 * - **解析行挂在哪版规则上就用哪版解释**；拿最新规则去解释旧解析结果，标签会凭空变。
 * - 解析证据坏了就当这个账户这段日子没有标签（`dimensions: null`），不拿半份结果冒充——
 *   分组里多一个凭空出现的桶，比少一个桶更难发现。
 */
export type LabelSource = ReturnType<typeof resolveSegmentDimension>["source"];

/** 某个账户在某个业务日用的那一行归属。 */
export interface AccountLabelBasis {
  effectiveFrom: string;
  /** 这一天早于该账户所有行，用的是最早一行——调用方必须发 `LABEL_BASIS_EARLIEST_KNOWN`。 */
  earliestKnown: boolean;
  nameMatches: boolean;
  /** 这一行挂的规则版本不在库里。 */
  ruleMissing: boolean;
  /** 维度/段 → 值与来源；这一行的解析证据解释不了时为 null。 */
  dimensions: Record<string, { value: string | null; source: LabelSource }> | null;
}

export interface AccountLabelsAsOf {
  /** 这个账户在这个业务日的归属；一行归属都没有时为 null。 */
  on(account: { media: string; accountId: string }, businessDate: string): AccountLabelBasis | null;
}

export const accountLabelKey = (row: { media: string; accountId: string }): string =>
  `${row.media}:${row.accountId}`;

/** 分组要的那一个值；没有归属、证据坏了、这一维没标注，统统是 null（归「未标注」）。 */
export function labelValue(basis: AccountLabelBasis | null, dimension: string): string | null {
  return basis?.dimensions?.[dimension]?.value ?? null;
}

function dimensionsOf(row: AccountLabelHistoryRow): AccountLabelBasis["dimensions"] {
  try {
    const entry: NonNullable<AccountLabelBasis["dimensions"]> = {};
    const named = resolveNamedDimensions({
      segments: row.parse.segments, override: row.parse.override ?? {},
      nameMatches: row.parse.nameMatches, ruleMappings: row.mappings,
    });
    for (const [dimension, value] of Object.entries(named)) entry[dimension] = { value: value.value, source: value.source };
    // 段值走 domain 那个共享解析器（`resolveSegmentDimension`）——维度查询用的是同一个，
    // 两处各写一份的话，「透视里按某段分组」和「维度里按同一段分组」迟早给出不同答案。
    const override = row.parse.override ?? {};
    for (const key of new Set([...Object.keys(row.parse.segments), ...Object.keys(override)])) {
      entry[`segment:${key}`] = resolveSegmentDimension(row.parse, key);
    }
    return entry;
  } catch {
    return null;
  }
}

/** 把历史行变成「按天问」的读取器。每行只解释一次，按天只是选行。 */
export function accountLabelsFromHistory(rows: readonly AccountLabelHistoryRow[]): AccountLabelsAsOf {
  const byAccount = new Map<string, { effectiveFrom: string; basis: Omit<AccountLabelBasis, "earliestKnown"> }[]>();
  for (const row of rows) {
    const history = byAccount.get(accountLabelKey(row)) ?? [];
    history.push({ effectiveFrom: row.effectiveFrom, basis: {
      effectiveFrom: row.effectiveFrom, nameMatches: row.parse.nameMatches,
      ruleMissing: row.mappings === null, dimensions: dimensionsOf(row),
    } });
    byAccount.set(accountLabelKey(row), history);
  }
  return {
    on(account, businessDate) {
      const picked = pickAccountLabelBasis(byAccount.get(accountLabelKey(account)) ?? [], businessDate);
      return picked === null ? null : { ...picked.row.basis, earliestKnown: picked.earliestKnown };
    },
  };
}

/**
 * v1.9.49 ①：四条读路径共用的入口。窗口 `[from, to]` 内任意一天都能问，窗口外的天不保证有候选行。
 * 在调用方的 RR/RO 快照上读；账户必须来自已批准的授权上下文。
 */
export async function resolveAccountLabelsAsOf(
  connection: SemanticReadConnection,
  input: { workspaceId: string; accounts: readonly { media: string; accountId: string }[]; from: string; to: string },
): Promise<AccountLabelsAsOf> {
  if (input.accounts.length === 0) return accountLabelsFromHistory([]);
  const rows = await new AccountLabelHistoryRepository(connection).load({
    workspaceId: input.workspaceId, accounts: input.accounts.map(({ media, accountId }) => ({ media, accountId })),
    from: input.from, to: input.to,
  });
  return accountLabelsFromHistory(rows);
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
