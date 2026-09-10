# P211 三命名维度响应候选

本目录是**合成 PostgreSQL 数据经真实 HTTP 得到的响应**，不含真实公司账户/金额，不代表 OS 联调成功；也不是 arch 冻结后的 `packages/contract/fixtures`。

生成器：`apps/worker/test/platform-named-dimension-pg.integration.test.ts`。在 Worker 中设置 `EXPORT_SYNTHETIC_NAMED_FIXTURES=1` 与本机专属 `TEST_DATABASE_URL` 运行该测试；默认测试不写文件。

入口沿现有 `POST /api/v1/query` 的 `{queryId:"account.dimension",params:{dateFrom,dateTo,dimensionType}}`。三份分别为 optimizer/goal/placement；未改前端、query ID、信封或数据源切换策略。

真实范围：个人空间 canonical，来源为同一 RR 快照内的账户指标/逐日生效考核价/parse 所绑定的历史规则。来源计数按账户而非天数。`source:"mixed"` 的同值组不会按来源拆成两行；未解析保留 null key + 未标注。metadata 未知字段继续 null。团队 KA 同形映射、多值筛选、级联选项仍是后续工作。
