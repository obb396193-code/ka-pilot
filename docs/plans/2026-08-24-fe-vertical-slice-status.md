# FE 可复用纵向切片状态

> 分支：`codex/fe-vertical-slice`  
> 范围：工作台 → 数据分析（三态）→ 账户详情 → 异常诊断 → 变更预览确认  
> 数据：全部为脱敏演示 mock；不得视为真实公司数据或线上结果。

## 双轴状态

| 轴 | 当前状态 | 证据/阻塞 |
|---|---|---|
| 交付 | `implemented` 进行中 | 候选类型、Query Registry、严格 mock、内网 API Adapter 已建立；页面与 E2E 待完成 |
| 审查 | `codex_prechecked` 进行中 | 单测从失败起步；全量质量门待纵向切片完成后执行 |

Claude 后续审核不是开工、联调或部署前置门。完成后审查轴进入 `claude_review_pending`，但交付轴继续独立推进。

## 阶段记录

### 2026-08-24 · 阶段 1：Contract 候选与数据适配层

- 起始分支未发现双数据后端实现，也没有 `apps/worker`、`packages/domain`、`packages/db`。
- 前端新增三种视图、七种状态、lineage（来源/截止时间/版本/覆盖/截断）严格校验。
- mock 均使用固定脱敏示例；缺失值为 `null + availability`，不伪装成 0。
- CPA、差异值、差异率均作为服务端展示字段进入 mock；前端不重算业务口径。
- `KA_DATA_PROVIDER=internal_api` 时通过服务端 Adapter 读取 `KA_DATA_API_URL`；Token 不暴露为 `NEXT_PUBLIC_*`。

## 内网联调阻塞项

| 项 | 当前状态 | 接通条件 |
|---|---|---|
| Query Registry 正式端点 | 未提供 | 内网给出完整 URL，或后端按候选信封实现 |
| KA Data/平台/对账正式 Schema | 未落起始分支 | 后端确认字段映射，前端 Adapter 增加 mapper，不改页面 |
| 服务身份与 Token | 未提供 | 通过 FaaS config vars 注入 `KA_DATA_API_TOKEN` |
| daily ACCESS_URL / 发布权限 | 当前外网环境不可得 | 内网执行 `a1 faas deploy` 后回传 URL、日志和健康检查 |
| 真实媒体写端点 | 不在本切片 | 继续禁用；变更页只做本地预览确认 |

## 状态推进规则

- `implemented`：代码、单测、build、E2E、部署包齐全。
- `integrated`：内网真实 API 返回通过 Schema，三视图主链路跑通。
- `deployed_internal`：daily 发布完成并有 ACCESS_URL、部署日志。
- `runtime_verified`：从真实浏览器访问内网 URL，主链路、七态与日志均验收通过。
- 审查轴独立：`codex_prechecked → claude_review_pending → claude_approved / changes_required`。
