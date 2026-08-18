# B1a 契约与存储 · 状态

> 分支：`be/b1a`
> 任务：R-007
> 契约：`packages/contract/schema.sql` + `metrics.md` + `api.md`
> 当前状态：主要逻辑与测试已完成；raw 四资源持久化/回放和应用最终组装等待 P-001 契约裁决

## 任务清单

- [x] 包级 TypeScript/Vitest/迁移工具链
- [x] PostgreSQL 契约迁移可重放
- [x] 指标分区按月创建
- [x] metrics.md 派生指标纯函数与边界测试
- [x] Qihang 四 resource 客户端与重试测试
- [x] jobs DB lease 消费器
- [x] etl_full / etl_incr handler 与 etl_runs 留痕
- [x] 失败重试与 outbound 告警
- [ ] metrics_raw 四 resource 落库/回放（阻塞：schema 缺 `resource`）
- [x] raw → canonical 纯合并、公式计算、生效版本读取、幂等 upsert
- [ ] Worker 最终应用组装（依赖上一项 raw store）
- [x] 全量测试、类型检查和本地 PG 冒烟
- [ ] 提交 SHA 回执 arch

## 计划外提前完成

- [x] 独立钉钉网关包级工具链
- [x] 官方 Stream 文本消息解析与 sessionWebhook 回复适配
- [x] 入站事件幂等、钉钉身份映射、任务安全入队
- [x] 确定性命令留在产品、复杂任务才进 `agent_task`
- [x] sessionWebhook/PAT 不落 job payload，回复 URL 防 SSRF
- [ ] 网关真实应用组装（阻塞：P-002 自然语言命令/任务创建/异步回群合同）

## 已确定技术选择

- 迁移：`node-pg-migrate`。理由：契约为 SQL-first，分区、函数和约束需要直接使用 PostgreSQL 能力；Drizzle 会再造一套 schema 真相。
- Runtime：Node.js 20 + TypeScript + 原生 fetch。
- 测试：Vitest；数据库集成测试连接 docker-compose PostgreSQL，不访问真实 Qihang。
- 取数身份：只读 job payload 的 `userId`；不读取开发机个人环境变量，不在日志打印完整 userId。

## 当前阻塞/待裁决

- P-001：根 workspace 工具文件归属、多租户键、raw resource、鉴权业务码与 infinite 表示，见 `docs/relay/inbox-arch.md`。
- P-002：钉钉自然语言命令、创建任务端点与异步回群 target 合同。
- 在 arch 裁决前不可冻结：raw 四资源持久化/回放、最终 Worker 组装、业务鉴权码映射、网关真实命令 API。

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
