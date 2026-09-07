import type { JobHandlers } from "../jobs/types.js";

/**
 * arch 开的缝（老板 2026-09-07：共享文件的结构性改造由 arch 做，两边只接自己那一头）。
 * be2 在这里注册 R-014 的 job handler（`daily_brief_generate` 1.8 早报、导出渲染 7.4、
 * `report_schedule` 定时推 3.10）。`runtime.ts` 只有一行 `...r014JobHandlers,`，
 * be2 永不修改 `runtime.ts` 本身。
 */
export const r014JobHandlers: JobHandlers = {};
