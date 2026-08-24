# R1 双数据 HTTP 与平台适配质量报告

> 日期：2026-08-24
>
> 分支：`codex/dual-data-backend`
>
> 代码提交：`de31f3a`
>
> 状态：implemented / codex self-checked / Claude review pending

## 修复结论

1. `POST /api/v1/data/query` 已进入独立可启动 Node HTTP composition，启动命令为
   `npm run start:data-api`；未与后台 Job Consumer 混跑。
2. 浏览器仍只允许走 Next BFF 的 `POST /api/internal/data-query`。BFF 到数据 API
   使用服务端内部 token 和受信 header 注入 workspace/user/account scope；浏览器请求体
   仍严格只有 `queryId/params/dataView`。
3. 新增 `PlatformDataSource`，真实调用 `SemanticQueryRepository` 的 summary/trend/table，
   anomalies 复用 canonical `data_anomaly`，detail/reconcile source 按最多 500 行分页读取。
4. canonical 查询新增服务端 accountIds 过滤和 `queryLineage`；`dataAsOf` 取持久化
   `max(computed_at)`，不是接口响应时间。
5. KA Data 与不可用来源不再填假 `datasetVersion/dataAsOf/timezone/dayCut`；缺失时返回
   `null + metadataAvailability=unknown|partial`。
6. 服务输出侧按 `(workspace_id, media, account_id)` 复核账户明细行。缺联合键、跨租户或
   超出授权账户的 Adapter 输出整次返回 `FORBIDDEN`，不回显越权对象。
7. 继续保留 Query Registry/raw SQL 防线、2,000/10,000/16MB 截断规则和稳定错误 envelope。
   对账内核仍明确 `reconciliation_engine_pending`，不生成 delta 或统一主数。
8. Runtime/Multica/ChangeSet 真实执行保持关闭，本批无媒体写操作。

## HTTP smoke

- 真实 ephemeral port 覆盖 `ka_data/platform/reconcile` 三态。
- 覆盖 401 无认证、403 错内部 token、畸形账户 scope、越权 Adapter 输出。
- 覆盖上游 timeout → 503 稳定错误、16MB 响应策略 → 502 `SOURCE_TRUNCATED`。
- 覆盖非法 JSON、请求体上限、未知路由、非 POST 和 `/healthz`。
- 另用 `start:data-api` 在 `127.0.0.1:43101` 真启动，`GET /healthz` 返回
  `{"ok":true}`，platform 空授权范围查询经真实 PostgreSQL composition 返回 canonical
  结果与 unknown/partial lineage；随后已停止进程。

## 最终门禁

- Domain：32 files / 406 passed。
- DB：19 files / 94 passed；PostgreSQL 16 真实迁移和仓储测试通过。
- Worker：58 files passed / 393 passed；2 个既有 opt-in 外部通路测试 skipped。
- DingTalk Gateway：5 files / 19 passed。
- 四包 typecheck、lint 通过；`npm audit --audit-level=high` 均为 0 vulnerabilities。
- Worker 全量覆盖率：statements 92.23%、branches 80.95%、functions 95.96%。
- `src/data`：statements 90.85%、branches 80.14%、functions 95%。
- HTTP server：statements/lines 91.71%、branches 84.21%、functions 100%。
- Platform DataSource：statements/lines 98.63%、branches 78.43%、functions 100%。
- `git diff --check`、敏感凭证扫描、动态执行/危险 SQL 模板扫描均无发现。

## 已知未完成

- Next BFF 路由和前端真实接线由前端/集成分支完成；本批没有触碰 `fe/f001`。
- 尚未使用真实 KA Data token、真实业务账户或内网 KA Data mapped origin 联调。
- 尚未部署 daily/FaaS；当前只证明本地真实 HTTP+PostgreSQL composition 可启动。
- `PLATFORM_DATASET_VERSION` 只有部署方提供真实版本时才填；目前默认 null。
- 对账计算引擎仍未实现，继续返回明确 unavailable，不输出伪差值。
- BFF 如何从正式登录/权限系统生成账户 scope 仍需集成方连接现有认证服务；数据 API 不
  自行发明角色权限矩阵。
- Claude/arch 尚未复审；本报告不宣称已批准。
