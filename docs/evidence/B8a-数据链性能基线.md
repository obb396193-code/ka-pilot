# B8a 数据链合成性能基线

> 日期：2026-08-20
>
> 分支：`be/b8a`
>
> 性质：本机、纯内存、脱敏合成基线；**不是生产 SLA，也不代表启航或 PostgreSQL 的真实吞吐**

## 1. 测量对象

本基线复用生产代码中的 `QihangClient` 和 `createCanonicalHandler`，但把外部依赖替换为本地 `Response` 与计数端口：

1. 生成 100、1,000、5,000 条假账户数据；
2. 经过 Qihang JSON 字节预算、流读取、JSON/Zod 解析；
3. 映射成 Canonical merge input；
4. 经过真实字段合并、衍生指标计算、异常判断和 Canonical handler 调度；
5. settings/history/upsert/run/job 端口只计数，不连网络、不连数据库。

每个规模先预热，再执行 5 次，报告总耗时中位数。测试只断言规模、字节数、调用次数和输出结构，不按某台机器的毫秒数设置易抖动门禁。

复现命令：

```bash
cd apps/worker
npm run benchmark:data -- --accounts=100,1000,5000 --iterations=5
```

## 2. 当前机器结果

运行环境：Node `v22.22.2`、Darwin arm64。

| 假账户数 | Qihang JSON | Qihang 解析 | Canonical 调度 | 合计 | 纯内存行/秒 | Canonical 端口调用 |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 20,228 B | 0.646 ms | 0.281 ms | 0.927 ms | 107,836.1 | 304 |
| 1,000 | 202,028 B | 2.028 ms | 2.423 ms | 4.452 ms | 224,626.6 | 3,004 |
| 5,000 | 1,010,028 B | 6.346 ms | 5.764 ms | 12.110 ms | 412,876.2 | 15,004 |

调用次数公式是 `3N + 4`：每条 input 各调用一次 effective settings、historical spend、upsert，另有一次 load inputs、start run、finish run、enqueue quality。两个读取端口虽然在单行内并发，但跨账户仍然线性增加。

## 3. 能得出的结论

1. 1,010,028 B 的 5,000 行瘦合成响应能通过当前默认 10 MiB 响应预算；真实启航字段更宽，可能先触发字节上限，这是预期的 fail-closed，不代表真实 5,000 行一定可接收。
2. 纯 TypeScript 解析与计算不是当前已暴露的主要风险；更明显的上线风险是 Canonical 的 `3N + 4` 端口调用模型。
3. 如果生产端口一调用对应一次 SQL，5,000 行会产生约 15,004 次端口调用。当前基线没有数据库 RTT、连接池竞争、锁、WAL、索引和网络开销，不能据此推算生产耗时。
4. 当前 Qihang 单查询 ID 预算为 1,000。大于 1,000 个账户需要在真实通路确认上游 URL/响应限制后，明确分片、进度、重试和部分失败语义；本批没有静默放宽。

## 4. 下一步性能门

真实联调前先保留现状，不凭合成结果改公开契约。拿到脱敏规模与测试库后应依次测：

1. PostgreSQL testcontainer 中 100/1,000/5,000 条真实 repository 调用和连接池占用；
2. settings/history 按 workspace+日期批量预取，确认是否能把两类读取从 `2N` 降到常数或分块调用；
3. Canonical bulk upsert，在不破坏租户隔离、幂等和失败定位的前提下降低 `N` 次写；
4. 启航响应字段宽度、最大 URL、分页与限流实测；
5. 以真实 FaaS CPU/内存和 PostgreSQL 规格制定 p50/p95、峰值内存、最大批次和超时 SLA。

## 5. 可复核证据

- Runner：`apps/worker/src/benchmark/data-pipeline.ts`
- CLI：`apps/worker/scripts/benchmark-data-pipeline.ts`
- 合约测试：`apps/worker/test/benchmark-data-pipeline.test.ts`
- 定向门禁：3 tests、Worker typecheck/lint、complexity≤10、单函数≤100 行均通过。
