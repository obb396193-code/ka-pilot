# 前端功能承接矩阵

> 状态：接管登记中。本文只登记 root 已冻结或已交接的能力，不表示页面已经实现、后端已经可联调或生产已经验证。

## 全局边界

- 唯一视觉母版：`apps/ui-layout-demo/sidebar.html`
- 正式运行时：`apps/web`
- 旧 FrontendAgent、旧 F-001 页面和已撤销 ContentRadar 小样不得作为视觉来源或整体合并。
- 前端不计算 CPA、Gap、达成率、环比等经营指标；只展示后端已给出的值和状态。
- 浏览器不得自报 `workspaceId`、`userId`、`role`、`accountIds` 等权限上下文。
- 普通业务页面固定奇航主链，不展示 `ka_data/platform/reconcile` 数据源选择器。
- root 未开放媒体写 Contract 前，不提供真实 `preview/confirm/execute` 入口。

## 接口冻结但待联调

证据：`codex/integration-control@68da060` 的 `packages/contract/api.md`、`packages/contract/schema.sql` 与 `docs/plans/2026-08-25-多租户身份与奇航主链-implementation.md`。

共同阻塞条件：后端 B23-A 实现 SHA 与 root R23-D 联调 fixtures 尚未同时到齐。以下能力只登记，不接真实 BFF。

| capability_id | 接口/规则 | 必须覆盖的状态 | contract_status | implementation_status | 视觉来源 |
|---|---|---|---|---|---|
| `auth.session` | `GET /api/internal/auth/session` | `loading / authenticated / unauthenticated / forbidden` | `blocked` | `not-started` | `sidebar.html` |
| `auth.login` | `POST /api/internal/auth/login` | `loading / success / invalid-credentials / error` | `blocked` | `not-started` | `sidebar.html` |
| `auth.workspace-switch` | `POST /api/internal/auth/workspace` | `loading / success / forbidden / error` | `blocked` | `not-started` | `sidebar.html` |
| `auth.logout` | `DELETE /api/internal/auth/session` | `loading / success / error` | `blocked` | `not-started` | `sidebar.html` |
| `auth.server-context` | session -> identity -> membership -> grants；禁止浏览器自报权限范围 | `authenticated / forbidden` | `blocked` | `not-started` | 非视觉规则 |
| `data.primary-route` | 普通业务页固定奇航主链；不显示内部数据源选择器 | `normal / unavailable / stale / error` | `blocked` | `not-started` | `sidebar.html` |
| `media.write` | 暂无可执行写操作 Contract | `disabled` | `missing` | `not-started` | 不生成入口 |

## 准入规则

能力只有同时满足以下条件，才可从 `not-started/blocked` 进入正式页面：

1. root 提供实现 SHA、fixture、权限边界和验收条件。
2. 前端为 schema 漂移、空值、零值、partial、stale、forbidden 与 request ID 写回归测试。
3. 老板确认页面视觉；root 确认功能、权限和状态。
4. 自动门禁、老板视觉签字、root 功能签字三者分别记录，不互相冒充。
