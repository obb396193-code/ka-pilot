/**
 * 告警码 → 人话。一份表，所有页面共用。
 *
 * 后端在两个地方发告警，形状不同但码同源：
 * · `source.warnings[]` —— **字符串码**，说的是「这次查询整体有什么不对」
 *   （小时源时区未配、现金系数缺、部分账户没采到）；
 * · `lineage.warnings[]` —— **对象**，点名到账户日（`missing-data-notice.tsx` 负责那套）。
 *
 * 分成两份表就会出现「同一个码在盯盘写一句、在大盘写另一句」，所以合在这里。
 *
 * ★**认不出来的码原样显示**，不吞。后端加了新告警而页面装作什么都没发生，
 * 比显示一个看不懂的码坏得多——至少后者能让人来问。
 */

const WARNING_TEXT: Record<string, string> = {
  /* 小时查询（`account.hourly`，`platform-hourly-query.ts`） */
  HOURLY_DAY_TIMEZONE_UNKNOWN: "源时区未配：小时切点不可信，「预估日消耗」也因此算不出",
  CASH_COEFFICIENT_MISSING: "现金口径缺系数：现金花费与现金 CPA 显「−」",
  HOURLY_COVERAGE_INCOMPLETE: "部分账户这些小时没采到：表里缺的行不是花了 0 块",

  /* 缺数点名（`lineage.warnings[]`，契约 v1.9.33） */
  BATCH_FAILED: "拉数失败",
  ACCOUNT_DAY_MISSING: "源未回数",

  /* 归属清洗（v1.9.49 A6） */
  LABEL_BASIS_EARLIEST_KNOWN: "归属按最早记录推定：该账户没有更早的归属记录，用已知最早的那条往前推",
}

/** 同族的码按前缀兜一句，免得后端加一个 `HOURLY_COVERAGE_PARTIAL` 页面就哑了 */
const PREFIX_TEXT: [string, string][] = [
  ["HOURLY_COVERAGE_", "部分账户这些小时没采到"],
]

/** 认识就翻译，不认识就原样返回码本身——绝不返回空串把告警吞掉 */
export function warningText(code: string): string {
  const exact = WARNING_TEXT[code]
  if (exact) return exact
  for (const [prefix, text] of PREFIX_TEXT) if (code.startsWith(prefix)) return text
  return code
}

/** 这个码有没有人话（用来决定要不要额外把原码也显出来给人报障用） */
export function warningKnown(code: string): boolean {
  return code in WARNING_TEXT || PREFIX_TEXT.some(([prefix]) => code.startsWith(prefix))
}
