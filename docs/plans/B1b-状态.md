# B1b 回灌与对平 · 状态

> 分支：`be/b1b`  
> 任务：R-008  
> 上游：B1a SHA `f98952f`  
> 设计：`docs/plans/2026-08-19-B1b回灌与对平-design.md`  
> 当前状态：进行中

## 任务清单

- [x] 老板批准修正版架构并通知 arch（P-005）
- [x] 设计与 TDD 实施计划
- [x] 实时优先的任务优先级常量
- [x] 确定性 job UUID
- [x] 幂等入队、lease heartbeat 与启动回收
- [x] backfill_jobs 仓储与协调器
- [x] 独立 backfill_day handler
- [ ] canonical 批次留痕与质量阶段衔接
- [ ] 三类 data quality 检查与 outbound 告警
- [ ] 10 账户 × 90 天 PostgreSQL 冒烟及证据
- [ ] 全量质量门禁与最终 SHA 回执

## 关键修正

- 历史回灌不复用 `etl_full`，避免重复账户发现和 7 天实时请求。
- 当前队列按 priority 升序领取，因此使用 `etl_incr=1 / rule_scan=3 / default=5 / backfill=9`。
- raw 可重复抓取；canonical 与质量对平只使用每账户/日/resource 最新 raw。
- mock PostgreSQL 冒烟不等于奇航真实接口已联通，真实联调仍在 B7。

## 验证记录

| 日期 | 检查 | 结果 |
|---|---|---|
| 2026-08-19 | 优先级与确定性 UUID TDD | ✅ 2 tests + typecheck + lint |
| 2026-08-19 | Job 幂等、heartbeat、启动回收 TDD | ✅ DB 6 + Worker 7 tests；typecheck + lint |
| 2026-08-19 | 90 天批次协调、单日回灌与完成后进度刷新 | ✅ DB 2 + Worker 9 tests；typecheck + lint |
