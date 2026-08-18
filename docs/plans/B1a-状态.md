# B1a 契约与存储 · 状态

> 分支：`be/b1a`
> 任务：R-007
> 契约：`packages/contract/schema.sql` + `metrics.md` + `api.md`
> 当前状态：规划完成，契约问题已回抛，尚未写业务代码

## 任务清单

- [ ] 包级 TypeScript/Vitest/迁移工具链
- [ ] PostgreSQL 契约迁移可重放
- [ ] 指标分区按月创建
- [ ] metrics.md 派生指标纯函数与边界测试
- [ ] Qihang 四 resource 客户端与重试测试
- [ ] jobs DB lease 消费器
- [ ] etl_full / etl_incr 与 etl_runs 留痕
- [ ] 失败重试与 outbound 告警
- [ ] metrics_raw → canonical 字段级合并
- [ ] 全量测试、类型检查和本地 PG 冒烟
- [ ] 提交 SHA 回执 arch

## 已确定技术选择

- 迁移：`node-pg-migrate`。理由：契约为 SQL-first，分区、函数和约束需要直接使用 PostgreSQL 能力；Drizzle 会再造一套 schema 真相。
- Runtime：Node.js 20 + TypeScript + 原生 fetch。
- 测试：Vitest；数据库集成测试连接 docker-compose PostgreSQL，不访问真实 Qihang。
- 取数身份：只读 job payload 的 `userId`；不读取开发机个人环境变量，不在日志打印完整 userId。

## 当前阻塞/待裁决

- P-001：根 workspace 工具文件归属、多租户键、raw resource、鉴权业务码与 infinite 表示，见 `docs/relay/inbox-arch.md`。
- 在 arch 裁决前可先做：指标纯函数、Qihang HTTP 重试框架、jobs lease 独立测试。
- 在 arch 裁决前不可冻结：最终 migration、raw/canonical 持久化字段和鉴权错误映射。

## 验证记录

| 日期 | 检查 | 结果 |
|---|---|---|
| 2026-08-19 | R-007 前置契约与协作规范实读 | ✅ |
| 2026-08-19 | 现有代码扫描 | ✅ 仅有 contract，无后端/根工具链 |
