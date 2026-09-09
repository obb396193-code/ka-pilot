# B9 后端纵向闭环与 Canonical 批量性能实施计划

> 日期：2026-08-20
>
> 分支：`be/b8a`
>
> 基线设计：`docs/plans/2026-08-20-B9后端纵向闭环与批量性能-design.md`
>
> 约束：测试先行；不改公开 contract、migration、生产 job_type 或前端；真实 PostgreSQL 只使用脱敏合成数据。

## 目标

把已有数据和经营内核接成一条可重复验证的真实 PostgreSQL 纵向链路，同时消除 Canonical 每行三次 Store 调用的 N+1 路径。最终用 100/1000/5000 行证据证明结果一致、调用量有界、重试幂等和租户隔离，而不把本机性能冒充生产 SLA。

## Task 1：冻结批量 CanonicalStore 契约与 Handler 行为

文件：

- 修改 `apps/worker/test/canonical-handler.test.ts`
- 修改 `apps/worker/src/etl/canonical-handler.ts`

步骤：

1. 先写失败测试：250 默认分批、可注入小 chunk、批量设置/历史映射、稳定输出顺序和空输入。
2. 写安全反例：返回缺失键、重复键、跨 workspace 键、非法 chunk size、第二批写失败。
3. 将端口改为 `loadEffectiveSettingsBatch`、`loadHistoricalSpendBatch`、`upsertCanonicalBatch`，复合键由共享纯函数生成，禁止模糊 account-only 映射。
4. Handler 每批先校验输入 workspace/account/ds，再并发读取设置和历史，完整构造 records 后一次 Upsert。
5. 保持现有 run 计数、失败阶段、确定性质量 Job 与“全部成功才派生”语义。
6. 运行：

```bash
cd apps/worker
npx vitest run test/canonical-handler.test.ts
npm run typecheck
npm run lint
```

## Task 2：实现 PostgreSQL 批量配置、历史和 Upsert

文件：

- 修改 `packages/db/test/metrics-repository.test.ts`
- 修改 `packages/db/src/metrics-repository.ts`
- 如需职责拆分，新增 `packages/db/src/metrics-batch.ts`
- 如新增导出，修改 `packages/db/src/index.ts`

步骤：

1. 先写真实 PG 失败测试：多账户/多日期一次读取、有效期选择、历史 14 个非零日、输入顺序无关。
2. 写 fail-closed 测试：账户不存在、跨 workspace 同 accountId、重复 key、返回覆盖不完整。
3. 写批量 Upsert 测试：多行插入、同复合键重跑覆盖、单批非法外键时整条 SQL 回滚。
4. 使用参数化 `jsonb_to_recordset` 或等价数组输入实现批量 SQL；所有读取和写入显式携带 workspace。
5. 返回以 `workspaceId/accountId/ds` 为精确 key 的 Map-friendly rows；数字统一走有限值转换。
6. 保留旧逐行方法仅当其他已存在调用仍需要；若无调用则删除，避免两套真相。
7. 运行：

```bash
cd packages/db
npx vitest run test/metrics-repository.test.ts
npm run typecheck
npm run lint
```

## Task 3：接线 Runtime 与合成 Benchmark

文件：

- 修改 `apps/worker/src/runtime.ts`
- 修改 `apps/worker/src/benchmark/data-pipeline.ts`
- 修改 `apps/worker/test/benchmark-data-pipeline.test.ts`
- 修改 `apps/worker/scripts/benchmark-data-pipeline.ts`

步骤：

1. 更新生产 Runtime 的 MetricsRepository 方法绑定，但不新增任何 job type。
2. 先修改 benchmark 合约测试，期望调用量由逐行 `3N` 变为每 chunk 三次。
3. Benchmark 记录 chunk size、chunk 数、各批量端口调用次数和行数；保留旧解析耗时作为前后可比基线。
4. 验证 100/1000/5000 输入不会突破既有 Qihang 资源预算；超过单次查询账户 ID 上限的场景仍明确拒绝，不伪造真实分片能力。
5. 运行：

```bash
cd apps/worker
npx vitest run test/benchmark-data-pipeline.test.ts test/canonical-handler.test.ts
npm run benchmark:data -- --accounts 100,1000,5000 --iterations 5
```

## Task 4：真实 PostgreSQL 纵向闭环集成测试

文件：

- 新增 `apps/worker/test/data-pipeline-pg.integration.test.ts`
- 如夹具过长，新增 `apps/worker/test/helpers/data-pipeline-fixture.ts`

步骤：

1. 迁移隔离测试库并清理本用例涉及表；插入两个 workspace、脱敏账户、任务、账户任务关系、渠道系数和考核价。
2. 建确定性假启航 QueryPort，运行真实 Full ETL Handler，断言 Raw 和 Canonical Job。
3. 领取或直接按真实 payload 执行 Canonical Handler，使用 RawMetricsRepository、MetricsRepository、EtlRunRepository 和 JobRepository，断言 Canonical 和质量 Job。
4. 运行真实 DataQualityHandler/Repository，断言检查记录和同 workspace 隔离。
5. 用 SemanticQueryRepository 查询 summary/trend/dimension，确认与 Canonical 口径一致。
6. 测试候选适配器只从真实语义结果生成候选，运行 RuleScanHandler + WorkItemRepository；告警使用无外发 sink，断言命中、未命中和重复合并。
7. 用 SemanticReportFactsSource 生成 KPI、趋势和维度事实，断言 data cutoff、范围和语义指标一致。
8. 补失败场景：配置缺失、批次写入中断后重跑、另 workspace 同 accountId、规则不命中、全链重复执行。
9. 本测试不得注册生产 rule/report Job，也不得访问内网/公网。
10. 运行：

```bash
cd apps/worker
npx vitest run test/data-pipeline-pg.integration.test.ts
```

## Task 5：真实 PG 批量性能与查询计划证据

文件：

- 新增 `apps/worker/scripts/benchmark-data-pipeline-pg.ts`
- 修改 `apps/worker/package.json`
- 新增 `docs/evidence/B9-数据链真实PG性能基线.md`

步骤：

1. CLI 只接受固定安全规模、chunk size、iterations 和测试库 URL；拒绝生产样式数据库主机或缺少显式测试标识的连接，避免误写。
2. 按 100/1000/5000 行生成脱敏账户、Raw、设置和历史数据；每个规模独立清理测试 workspace。
3. 预热后运行多次，记录中位数、行吞吐、批次数、SQL/端口调用次数、重跑结果。
4. 对配置批量查询、历史批量查询和 Upsert 生成 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 摘要；敏感连接信息不写证据。
5. 将环境、PostgreSQL/Node 版本、限制和非 SLA 声明写入证据。
6. 运行：

```bash
cd apps/worker
npm run benchmark:data:pg -- --accounts 100,1000,5000 --chunk-size 250 --iterations 3
```

## Task 6：全量质量门禁、自审与 Claude 回执

文件：

- 新增 `docs/plans/B9-状态.md`
- 新增 `docs/evidence/B9-代码质量报告.md`
- 修改 `docs/plans/工作台账.md`
- 修改 `docs/plans/Codex后端交付总账.md`
- 修改 `docs/relay/inbox-arch.md`

步骤：

1. 运行四包全部 tests、typecheck、lint、audit 和 coverage；专项新增模块覆盖率不低于 80%。
2. 重放 PostgreSQL migration up/down/up，确认本批没有意外 migration 差异。
3. 扫描变更生产代码：复杂度 ≤10、单函数 ≤100 行、动态执行/任意 SQL/凭证形态字符串和真实公司数据。
4. 对比基线 `3d90bed`，确认 `packages/contract`、`packages/db/migrations`、前端零差异。
5. 逐项复核纵向链路不是“全 mock”：数据库、Repository 和 Handler 都是真实现；仅启航、未冻结规则候选和外发告警是测试适配器。
6. 在 P-016 中列明功能 SHA、性能证据、已完/未做、风险和 Claude 必审点。
7. 每个独立 Task 完成后提交；最终 `git status` 干净并执行 `git show --stat HEAD`。

## 完成定义

- 真实 PG 纵向链路可重复通过，且不访问真实启航/Multica/OS；
- Canonical 不再按行读取设置/历史并写入；
- 100/1000/5000 行性能结果和查询计划有可复核证据；
- 幂等、失败恢复、跨租户和缺配置反例通过；
- 公开 contract、migration、production job type 和前端无变化；
- 质量报告、总账和 P-016 足以让 Claude 上线后直接审查。
