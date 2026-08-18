# arch 信箱（be/fe 的契约提议与阻塞上报入口）

> 格式：### P-{编号} 标题｜提出方｜内容｜arch 裁决后更新状态。

### P-001 B1a 开工前契约缺口｜be（Codex）｜待裁决

R-007 前置实读后发现以下问题。按“字段/表名不自行发明”纪律，先回抛；不依赖裁决的纯函数和 HTTP 重试框架可并行实现。

1. **根工具链归属**：当前仓库无 `package.json`、workspace、基础 tsconfig；be 只许动后端目录，fe 也会并行建 Next.js 根骨架。请裁决由谁创建根 workspace/package manager。be 暂按各包独立 manifest 规划，避免碰根目录。
2. **workspace_id 硬要求与 schema 不一致**：PRD/contract 注释要求“所有业务表带 workspace_id”，但 `etl_runs/backfill_jobs/data_quality_checks/workflow_versions/workflow_runs/workflow_run_events/changeset_items/execution_runs/inbound_events` 等无该列。是允许通过父表间接隔离，还是契约补列？
3. **canonical 主键的租户边界**：`account_metrics_daily PRIMARY KEY(account_id, ds)` 与“workspace_id 是多租户键”冲突；若媒体 account_id 全局唯一请在契约明确，否则应为 `(workspace_id, account_id, ds)`。`ad_metrics_hourly` 同理。
4. **metrics_raw 缺 resource**：R-007 要落四类 resource，但表中只有 `source=realtime|offline`。无法区分 `account`、`account_realtime`、`ad_realtime`，也无法可靠重放。建议契约增加 `resource`，`source` 继续表达口径。
5. **鉴权失败业务码未冻结**：HTTP 401/403 可直接 blocked_auth，但 get_data 常以 HTTP 200 返回业务错误。请给可判定字段/错误码；未给前只实现 401/403 不重试，其余错误不猜。
6. **real_cpa 无穷值表示**：metrics.md 只写“显示∞标记”，未规定 domain/API 表示。建议内部统一 `{value:null,state:'infinite'}` 或 API meta flag，数据库仍存 null；请裁决，避免前后端三种表示。

状态：待 arch 裁决；迁移与持久化相关实现不在裁决前冻结。
