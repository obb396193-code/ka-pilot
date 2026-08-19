# B1a 契约与存储 · 状态

> 分支：`be/b1a`
> 任务：R-007
> 契约：`packages/contract/schema.sql` + `metrics.md` + `api.md`
> 当前状态：✅ 已完成，契约 v1.1 裁决已全部落实，等待 arch 按最终 SHA 验收

## 任务清单

- [x] 包级 TypeScript/Vitest/迁移工具链
- [x] PostgreSQL 契约迁移可重放
- [x] 指标分区按月创建
- [x] metrics.md 派生指标纯函数与边界测试
- [x] Qihang 四 resource 客户端与重试测试
- [x] jobs DB lease 消费器
- [x] etl_full / etl_incr handler 与 etl_runs 留痕
- [x] 失败重试与 outbound 告警
- [x] metrics_raw 四 resource 落库/回放（含去身份化 request_params）
- [x] raw → canonical 纯合并、公式计算、生效版本读取、幂等 upsert
- [x] Worker 最终应用组装（迁移、消费、凭证归属、优雅退出）
- [x] 全量测试、类型检查和本地 PG 冒烟
- [x] 提交 SHA 回执 arch

## 计划外提前完成

- [x] 独立钉钉网关包级工具链
- [x] 官方 Stream 文本消息解析与 sessionWebhook 回复适配
- [x] 入站事件幂等、钉钉身份映射、任务安全入队
- [x] 确定性命令留在产品、复杂任务才进 `agent_task`
- [x] sessionWebhook/PAT 不落 job payload，回复 URL 防 SSRF
- [x] 网关真实应用组装（自然语言查数、任务草稿、异步工作项回复三端点）

## 已确定技术选择

- 迁移：`node-pg-migrate`。理由：契约为 SQL-first，分区、函数和约束需要直接使用 PostgreSQL 能力；Drizzle 会再造一套 schema 真相。
- Runtime：Node.js 20 + TypeScript + 原生 fetch。
- 测试：Vitest；数据库集成测试连接 docker-compose PostgreSQL，不访问真实 Qihang。
- 取数身份：不信任 payload 的 `userId`；Worker 按 job 冻结的 `credential_owner_user_id` 解析奇航身份。重试不换 owner；无 owner 只允许显式配置的全局只读服务身份。
- raw 回放：持久化 `resource + request_params + payload`；`request_params` 主动剔除 `userId`，canonical 按 workspace/账户/日期/resource 取最新快照。
- 钉钉命令：产品 API 会话缓存 20 分钟；查数先自然语言转结构化 query，再调用统一语义层；创建任务以钉钉事件号做幂等键。

## 当前阻塞/后续边界

- B1a 无阻塞；P-001～P-003 已全部落实。
- HTTP 200 业务鉴权码仍按契约留给 B7 内网实证，不在 B1a 猜测映射。
- 三个产品 API 的服务端实现属于 B1c；B1a 已完成网关客户端、结构校验与 mock 合同测试，尚不宣称真实内网 E2E 已通过。

## 验证记录

| 日期 | 检查 | 结果 |
|---|---|---|
| 2026-08-19 | R-007 前置契约与协作规范实读 | ✅ |
| 2026-08-19 | 现有代码扫描 | ✅ 仅有 contract，无后端/根工具链 |
| 2026-08-19 | domain 单测 | ✅ 12 项（指标 7 + canonical 5） |
| 2026-08-19 | worker 单测 | ✅ 19 项（Qihang/lease handler/ETL/canonical/告警） |
| 2026-08-19 | db PostgreSQL 集成测试（阶段性） | ✅ 迁移重放、lease、ETL 留痕、outbox、参数版本、canonical upsert、网关仓储 |
| 2026-08-19 | DingTalk gateway 单测 | ✅ 14 项 |
| 2026-08-19 | 全量测试 | ✅ 56 项（domain 12 / worker 19 / db 11 / gateway 14） |
| 2026-08-19 | TypeScript + ESLint | ✅ 四包全通过 |
| 2026-08-19 | V8 覆盖率 | ✅ domain 92.17% / worker 90.82% / db 80.69% / gateway 83.16% |
| 2026-08-19 | npm audit high | ✅ 四包均 0 vulnerabilities |
| 2026-08-19 | 本地 PostgreSQL 16 | ✅ healthy；迁移 down/up 重放通过 |
| 2026-08-19 | 凭证模式扫描 / diff check | ✅ 未发现明文凭证；无空白错误 |
| 2026-08-19 | 契约 v1.1 升级迁移 | ✅ 复合租户主键、8 个新增列、raw replay 索引；up/down 重放通过 |
| 2026-08-19 | raw 持久化与回放 | ✅ 四 resource 落库；canonical 最新快照回放；时区日期边界修正 |
| 2026-08-19 | 凭证归属 | ✅ 用户 owner / 账户 owner 解析 / 全局只读服务身份；缺凭证 blocked_auth |
| 2026-08-19 | Worker + Gateway composition | ✅ 两应用均有独立启动、自动迁移、优雅退出；网关对接冻结三端点 |
| 2026-08-19 | 最终全量测试 | ✅ 69 项（domain 12 / worker 24 / db 14 / gateway 19） |
| 2026-08-19 | 最终覆盖率门禁 | ✅ domain 93.39% / worker 85.14% / db 81.32% / gateway 86.62%（业务源码行） |
| 2026-08-19 | 最终依赖与安全审计 | ✅ 四包 0 vulnerabilities；无硬编码 token/私钥/动态执行；最长业务文件 239 行 |
