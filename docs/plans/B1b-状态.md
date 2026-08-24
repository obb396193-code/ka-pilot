# B1b 回灌与对平 · 状态

> 分支：`be/b1b`
> 任务：R-008
> 上游：B1a SHA `f98952f`
> 设计：`docs/plans/2026-08-19-B1b回灌与对平-design.md`
> 当前状态：已完成，待 arch 验收

## 任务清单

- [x] 老板批准修正版架构并通知 arch（P-005）
- [x] 设计与 TDD 实施计划
- [x] 实时优先的任务优先级常量
- [x] 确定性 job UUID
- [x] 幂等入队、lease heartbeat 与启动回收
- [x] backfill_jobs 仓储与协调器
- [x] 独立 backfill_day handler
- [x] canonical 批次留痕与质量阶段衔接
- [x] 三类 data quality 检查与 outbound 告警
- [x] 10 账户 × 90 天 PostgreSQL 冒烟及证据
- [x] 全量质量门禁与最终 SHA 回执

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
| 2026-08-19 | canonical 留痕、幂等 quality 衔接与历史零耗过滤 | ✅ DB 3 + Worker 4 tests；typecheck + lint |
| 2026-08-19 | latest raw 总量对平、CPA 超 5 倍与连续两日缺数告警 | ✅ DB 4 + Worker 4 tests；typecheck + lint |
| 2026-08-19 | 10 个脱敏假账户 × 90 天完整 PostgreSQL 冒烟 | ✅ canonical 900；quality 270/270；failed 0；游标到 2026-08-18 |
| 2026-08-19 | 四包全量 tests + coverage + typecheck + lint | ✅ 88 tests；行覆盖率 93.39% / 85.24% / 84.75% / 86.62% |
| 2026-08-19 | 依赖、安全、复杂度与 diff 门禁 | ✅ 4 包 0 vulnerabilities；0 Critical/High；生产源文件最长 288 行；diff 无空白错误 |

证据：`docs/evidence/B1b-90天回灌日志.txt`、`docs/evidence/B1b-90天回灌.png`。全部为程序生成的脱敏假数据，不代表真实奇航接口已联通。

## 质量审查结论

- Critical：0；High：0；Medium：0 阻断项。
- 无明文 token/私钥，无 `eval`/`new Function`/子进程动态执行。
- SQL 均使用参数化；`metrics_raw` 批量插入仅动态组装应用自生成的占位符，不插值。
- Worker runtime 为组装层且由处理器测试覆盖；整体 Worker 行覆盖率 84.75%。
