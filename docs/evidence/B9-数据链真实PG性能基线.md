# B9 数据链真实 PostgreSQL 性能基线

> 日期：2026-08-20
>
> 分支：`be/b8a`
>
> 性质：本机 Docker PostgreSQL + 脱敏合成数据的可重复基线；**不是生产 SLA，也不包含真实启航网络、FaaS 规格或并发负载**

## 1. 测量对象

本基准使用真实生产实现：

1. `RawMetricsRepository.loadMergeInputs` 从 PostgreSQL 分区表读取 offline/realtime Raw；
2. `createCanonicalHandler` 执行真实字段合并、衍生指标和异常判断；
3. `MetricsRepository.loadEffectiveSettingsBatch` 批量读取渠道系数与考核价；
4. `MetricsRepository.loadHistoricalSpendBatch` 批量读取历史非零消耗；
5. `MetricsRepository.upsertCanonicalBatch` 批量写入 Canonical 分区表；
6. 重复执行验证同复合键 Upsert 收敛，最后自动清理本次 synthetic workspace。

Run/EtlJob 端口使用无数据库副作用的计数适配器，所以数字聚焦 Canonical 数据路径，不包含 Job lease、运行日志和质量检查 SQL。

安全限制：CLI 只允许 `localhost/127.0.0.1/::1:55432/ka`，规模只允许 100、1000、5000，迭代 1~10，chunk 1~1000；拒绝生产式主机或库名。

复现命令：

```bash
cd apps/worker
npm run benchmark:data:pg -- --accounts=100,1000,5000 --chunk-size=250 --iterations=3
```

## 2. 环境

- Node：`v22.22.2`
- 客户端：Darwin arm64
- PostgreSQL：`16.14`，aarch64 Alpine Docker
- chunk size：250
- 每个规模：完成 fixture 后连续运行 3 次，报告 Canonical 总耗时中位数
- 查询计划：`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`，均为热缓存快照

## 3. 当前结果

| 合成账户数 | chunk 数 | Canonical 中位耗时 | 行/秒 | 最终行数 | 端口调用 |
|---:|---:|---:|---:|---:|---:|
| 100 | 1 | 16.818 ms | 5,946.158 | 100 | 7 |
| 1,000 | 4 | 71.545 ms | 13,977.307 | 1,000 | 16 |
| 5,000 | 20 | 394.974 ms | 12,659.066 | 5,000 | 64 |

端口调用公式为 `3×ceil(N/250)+4`：每个 chunk 各一次 settings/history/upsert，另有 load inputs、start、finish、enqueue。与 B8a 逐行基线相比：

| 行数 | B8a 逐行调用 | B9 批量调用 | 减少 |
|---:|---:|---:|---:|
| 100 | 304 | 7 | 97.70% |
| 1,000 | 3,004 | 16 | 99.47% |
| 5,000 | 15,004 | 64 | 99.57% |

## 4. 查询计划快照

### 100 行

| 查询 | 根节点 | 执行时间 | Shared hit/read |
|---|---|---:|---:|
| 账户批量范围 | Index Scan | 0.063 ms | 7 / 0 |
| Canonical workspace+日期 | Index Scan | 0.046 ms | 17 / 0 |
| Raw 最新合并输入 | Unique | 0.209 ms | 16 / 0 |

### 1,000 行

| 查询 | 根节点 | 执行时间 | Shared hit/read |
|---|---|---:|---:|
| 账户批量范围 | Index Scan | 0.222 ms | 44 / 0 |
| Canonical workspace+日期 | Index Scan | 0.682 ms | 1,877 / 0 |
| Raw 最新合并输入 | Unique | 1.377 ms | 151 / 0 |

### 5,000 行

| 查询 | 根节点 | 执行时间 | Shared hit/read |
|---|---|---:|---:|
| 账户批量范围 | Index Scan | 0.828 ms | 210 / 0 |
| Canonical workspace+日期 | Index Scan | 3.250 ms | 10,267 / 0 |
| Raw 最新合并输入 | Unique | 6.488 ms | 743 / 0 |

三组均未出现根级顺序全表扫描。Raw 查询根节点为 `Unique`，其职责是从 append-only Raw 中选每个 workspace/account/date/resource 的最新记录；当前 5000 行热缓存执行时间 6.488ms。计划只反映本次合成分布和热缓存，不能推导生产冷缓存或并发性能。

## 5. 结论与限制

可以确认：

1. Canonical 的 N+1 端口模型已经消除，5000 行由 15004 次降到 64 次；
2. 100/1000/5000 行均得到精确同数 Canonical 行，三次重跑未增加重复行；
3. 当前复合主键和 workspace/date 查询能走索引；
4. 默认 250 行 chunk 在本机 PostgreSQL 下没有触发参数、事务或内存错误。

不能据此确认：

- 真实启航宽响应、限流、分页和网络耗时；
- FaaS CPU/内存、连接池竞争、WAL/磁盘压力；
- 多 workspace 并发、冷缓存、锁等待和 p95/p99；
- 5000 个 ID 单请求能力。现有启航单查询 ID 上限仍为 1000，本基准是数据库侧 fixture，不绕过该限制；
- 批量 Upsert 的独立 `EXPLAIN ANALYZE`。本次用端到端真实写耗时和最终行数验证，查询计划表仅覆盖三条代表性读路径。

## 6. 可复核入口

- Runner：`apps/worker/src/benchmark/data-pipeline-pg.ts`
- CLI：`apps/worker/scripts/benchmark-data-pipeline-pg.ts`
- 参数安全测试：`apps/worker/test/benchmark-data-pipeline-pg.test.ts`
- 纵向集成：`apps/worker/test/data-pipeline-pg.integration.test.ts`
