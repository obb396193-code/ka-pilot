# P211 个人多值筛选 · 合成 HTTP 候选

四份文件来自 `apps/worker/test/dashboard-filters-pg.integration.test.ts` 实际本机 HTTP 响应，不是手抄成功样例；全部账户、任务、金额为随机 workspace 下的合成测试数据。

生成：在 Worker 包设置专用 localhost:55432 的 `TEST_DATABASE_URL`（库名 `ka_*_test`），运行 `EXPORT_SYNTHETIC_DASHBOARD_FIXTURES=1 npm test -- --run test/dashboard-filters-pg.integration.test.ts`。测试只清理自身随机 workspace。HTTP SessionAuth 使用批准上下文测试桩，不冒充真实登录/OS数据。

请求均走 `POST /api/v1/query`，`queryId` 为 `account.summary/trend/table/dimension`，`params.dateFrom/dateTo` = 2026-09-01/02；`params.filters` = `{optimizer:["owner-a"],biz:["biz-two"],task_id:["two"],goal:["goal"],resource_position:["placement"]}`。dimension 另传 `dimensionType:"optimizer"`。

只包含 owner-a 在第二天 task-two 的10元，不含第一天 task-one 的1000元，也不含同号其他媒体/空间的900元。source未知元数据仍null，不冒用响应时间。

候选供 arch 审后冻结；未改 `packages/contract/fixtures`，未替前端做私有成功形状。级联选项与团队源不是本批交付。
