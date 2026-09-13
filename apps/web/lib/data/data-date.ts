/**
 * 「数据日」的兜底链——**站里只此一份**（F8-25/F8-26 ②，arch A 派单）。
 *
 * 数据日 = 有数的最后一天。所有窗口预设以它为终点往前推，**不是以今天**——
 * 今天的数还没跑完。写死一个日期的后果很隐蔽：别人真实部署一打开，
 * 「近 7 天」算出来是**和今天毫无关系的一段**，而页面上看不出异常。
 *
 * 兜底链，从最准到最糙：
 *   1. `lineage.dataAsOf` —— 后端明说的截数时刻；
 *   2. `lineage.window.to` —— 这次响应**实际覆盖到的最后一天**。
 *      dataAsOf 可能是 null（联调库那份就是），但窗口末日一定有，而它就是「有数的最后一天」；
 *   3. 都没有 → 返回 null，由调用方回落今天并在页头标「数据日未知」。
 *
 * 抽成共用函数是因为数据分析页和工作台各写一份的话，两边迟早不一致——
 * 而「两个页面的近 7 天不是同一段」这种事，对账时才会发现。
 */

export type LineageLike = { dataAsOf?: string | null; window?: { to?: string } } | null | undefined

/** 取数据日；取不到返回 null（调用方负责回落今天 + 标注「数据日未知」） */
export function readDataDate(lineage: LineageLike): string | null {
  return lineage?.dataAsOf?.slice(0, 10) ?? lineage?.window?.to ?? null
}

/** 本地今天（`YYYY-MM-DD`）。只在数据日未知时当兜底用。 */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
