# B1c 语义查询内核实施计划

> 使用测试先行；每个任务先观察失败，再写最小实现。

## Task 1：查询输入、数值映射与保护

**文件**

- 新建：`packages/db/src/semantic-query-repository.ts`
- 新建：`packages/db/test/semantic-query-repository.test.ts`
- 修改：`packages/db/src/index.ts`

**步骤**

1. 写日期范围、分页、维度、排序白名单的失败测试；
2. 实现输入类型、校验器、numeric/null 映射；
3. 验证非法输入在发 SQL 前失败；
4. 运行 DB 定向测试、typecheck、lint；
5. 提交 `[be] 建立语义查询输入边界`。

## Task 2：table 明细查询

**文件**

- 修改：`packages/db/src/semantic-query-repository.ts`
- 修改：`packages/db/test/semantic-query-repository.test.ts`

**步骤**

1. 写跨租户相同 account_id、日期/账户/媒体/owner/任务筛选、稳定排序分页测试；
2. 用 LATERAL 聚合关联任务数组，保持一户一日一行；
3. 使用 count window 返回过滤后的总行数；
4. 验证任务有效期边界；
5. 提交 `[be] 实现语义明细查询`。

## Task 3：summary 与 trend

**文件**

- 修改：`packages/db/src/semantic-query-repository.ts`
- 修改：`packages/db/test/semantic-query-repository.test.ts`

**步骤**

1. 写加法指标、空数据、汇总 CPA/CTR/CVR 口径测试；
2. SQL 只聚合事实值，TypeScript 用 `@ka/domain` 的安全除法计算比率；
3. 写按日趋势测试，不补造数据库中不存在的日期；
4. 提交 `[be] 实现汇总与趋势查询`。

## Task 4：dimension 聚合与归属冲突

**文件**

- 修改：`packages/db/src/semantic-query-repository.ts`
- 修改：`packages/db/test/semantic-query-repository.test.ts`

**步骤**

1. 写 account/task/biz 三维聚合测试；
2. 写同账户同日两个有效任务的失败测试；
3. 在任务/业务查询前执行重叠检测，抛出 `AmbiguousTaskMappingError`；
4. 复用同一套 totals/ratio 映射，禁止平均行级比率；
5. 提交 `[be] 实现安全维度聚合`。

## Task 5：health 数据健康查询

**文件**

- 修改：`packages/db/src/semantic-query-repository.ts`
- 修改：`packages/db/test/semantic-query-repository.test.ts`

**步骤**

1. 写 canonical 覆盖组成量测试；
2. 写每个 raw resource 最新 fetched_at 测试；
3. 写 ETL 状态计数、质量检查通过/失败计数测试；
4. 不输出未经合同确认的覆盖率结论；
5. 提交 `[be] 实现数据健康查询`。

## Task 6：质量门禁、证据和交付

**文件**

- 修改：`docs/plans/B1c-状态.md`
- 修改：`docs/plans/工作台账.md`
- 修改：`docs/relay/inbox-arch.md`

**步骤**

1. 跑 PostgreSQL 定向测试和四包全量 tests；
2. 跑 coverage、typecheck、lint、依赖审计与 diff 检查；
3. 记录真实结果、已知边界和最终 SHA；
4. 向 arch 信箱说明合同待冻结项，不阻塞本批内核；
5. 提交 `[be] 完成B1c语义查询内核质量门禁`。

