/**
 * v1.9.49 ①（Q-044 ③）：某个业务日该用账户的哪一行归属。
 *
 * 选行规则**只写在这一处**——透视、维度、看板筛选、日报都从这里选。
 * 各写一份的后果不是报错，而是「透视说这天归张三、日报说归李四」，两边都像是对的。
 *
 * - 取 `effectiveFrom <= businessDate` 的最新一行；
 * - 这一天早于该账户的所有行 → 用最早一行并标 `earliestKnown`，调用方据此发
 *   `LABEL_BASIS_EARLIEST_KNOWN`：拿最早已知的归属往前套是推断，可以推断，但不能不说；
 * - 一行都没有 → null，归「未标注」。
 */
export interface LabelBasisCandidate {
  readonly effectiveFrom: string;
}

export interface LabelBasisPick<Row> {
  row: Row;
  earliestKnown: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function pickAccountLabelBasis<Row extends LabelBasisCandidate>(
  rows: readonly Row[], businessDate: string,
): LabelBasisPick<Row> | null {
  if (!DATE.test(businessDate)) throw new Error("Label basis business date must be YYYY-MM-DD");
  let picked: Row | undefined;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    // 用字符串比日期的前提是格式固定、行按生效日严格递增——两条都当场验，不默认调用方排好了。
    if (!DATE.test(row.effectiveFrom) || (index > 0 && row.effectiveFrom <= rows[index - 1]!.effectiveFrom)) {
      throw new Error("Label basis rows must be strictly ascending YYYY-MM-DD dates");
    }
    if (row.effectiveFrom <= businessDate) picked = row;
  }
  if (picked !== undefined) return { row: picked, earliestKnown: false };
  const earliest = rows[0];
  return earliest === undefined ? null : { row: earliest, earliestKnown: true };
}

/** `lineage.warnings` 里那条对象形告警（形状见 `lineageWarningSchema`）。 */
export function labelBasisEarliestKnownWarning(input: { media: string; accountId: string; businessDate: string }) {
  return {
    code: "LABEL_BASIS_EARLIEST_KNOWN" as const,
    media: input.media, accountId: input.accountId, businessDate: input.businessDate,
  };
}
