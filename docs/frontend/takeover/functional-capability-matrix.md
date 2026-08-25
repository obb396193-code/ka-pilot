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

## 机器可读记录

以下 JSON 是门禁读取的权威记录；上方表格只用于快速查看。字段约束见 `functional-capability-matrix.schema.json`。

<!-- capability-matrix:start -->
```json
[
  {
    "capability_id": "workbench.shell",
    "route": "/",
    "prd_status": "frozen",
    "contract_status": "missing",
    "root_evidence": "docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md#9-第一阶段范围",
    "states": ["normal", "loading", "empty", "error", "partial", "stale", "no-permission", "disabled"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": "2026-08-25: sidebar.html approved as the only visual mother",
    "root_function_signoff": null
  },
  {
    "capability_id": "workbench.sidebar",
    "route": "/",
    "prd_status": "frozen",
    "contract_status": "missing",
    "root_evidence": "docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md#31-视觉母版层",
    "states": ["expanded", "collapsed", "active", "disabled"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": "2026-08-25: sidebar.html approved as the only visual mother",
    "root_function_signoff": null
  },
  {
    "capability_id": "workbench.header",
    "route": "/",
    "prd_status": "frozen",
    "contract_status": "missing",
    "root_evidence": "docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md#31-视觉母版层",
    "states": ["normal", "loading", "disabled"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": "2026-08-25: sidebar.html approved as the only visual mother",
    "root_function_signoff": null
  },
  {
    "capability_id": "workbench.kpi-container",
    "route": "/",
    "prd_status": "candidate",
    "contract_status": "missing",
    "root_evidence": "docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md#9-第一阶段范围",
    "states": ["normal", "loading", "empty", "partial", "stale", "error", "no-permission"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": "2026-08-25: sidebar.html KPI geometry approved; business fields pending Contract",
    "root_function_signoff": null
  },
  {
    "capability_id": "workbench.chart-container",
    "route": "/",
    "prd_status": "candidate",
    "contract_status": "missing",
    "root_evidence": "docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md#9-第一阶段范围",
    "states": ["normal", "loading", "empty", "partial", "stale", "error", "no-permission"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": "2026-08-25: sidebar.html chart geometry approved; business series pending Contract",
    "root_function_signoff": null
  },
  {
    "capability_id": "workbench.tabs",
    "route": "/",
    "prd_status": "candidate",
    "contract_status": "missing",
    "root_evidence": "docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md#9-第一阶段范围",
    "states": ["normal", "active", "disabled"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": "2026-08-25: sidebar.html tabs approved as visual structure",
    "root_function_signoff": null
  },
  {
    "capability_id": "workbench.data-table",
    "route": "/",
    "prd_status": "candidate",
    "contract_status": "missing",
    "root_evidence": "docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md#9-第一阶段范围",
    "states": ["normal", "loading", "empty", "partial", "stale", "error", "no-permission", "disabled"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": "2026-08-25: sidebar.html DataTable visual structure approved; fields pending Contract",
    "root_function_signoff": null
  },
  {
    "capability_id": "auth.session",
    "route": "/api/internal/auth/session",
    "prd_status": "frozen",
    "contract_status": "blocked",
    "root_evidence": "codex/integration-control@68da060:packages/contract/api.md#AUTH-001",
    "states": ["loading", "authenticated", "unauthenticated", "forbidden"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": null,
    "root_function_signoff": null
  },
  {
    "capability_id": "auth.login",
    "route": "/api/internal/auth/login",
    "prd_status": "frozen",
    "contract_status": "blocked",
    "root_evidence": "codex/integration-control@68da060:packages/contract/api.md#AUTH-001",
    "states": ["loading", "success", "invalid-credentials", "error"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": null,
    "root_function_signoff": null
  },
  {
    "capability_id": "auth.workspace-switch",
    "route": "/api/internal/auth/workspace",
    "prd_status": "frozen",
    "contract_status": "blocked",
    "root_evidence": "codex/integration-control@68da060:packages/contract/api.md#AUTH-001",
    "states": ["loading", "success", "forbidden", "error"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": null,
    "root_function_signoff": null
  },
  {
    "capability_id": "auth.logout",
    "route": "/api/internal/auth/session",
    "prd_status": "frozen",
    "contract_status": "blocked",
    "root_evidence": "codex/integration-control@68da060:packages/contract/api.md#AUTH-001",
    "states": ["loading", "success", "error"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": null,
    "root_function_signoff": null
  },
  {
    "capability_id": "auth.server-context",
    "route": "/api/internal/auth/*",
    "prd_status": "frozen",
    "contract_status": "blocked",
    "root_evidence": "codex/integration-control@68da060:packages/contract/schema.sql",
    "states": ["authenticated", "forbidden"],
    "old_non_visual_code": [],
    "visual_source": "none: server-side identity and grant rule",
    "implementation_status": "not-started",
    "boss_visual_signoff": null,
    "root_function_signoff": null
  },
  {
    "capability_id": "data.primary-route",
    "route": "/api/internal/*",
    "prd_status": "frozen",
    "contract_status": "blocked",
    "root_evidence": "codex/integration-control@68da060:packages/contract/api.md#DATA-ROUTE-001",
    "states": ["normal", "unavailable", "stale", "error"],
    "old_non_visual_code": [],
    "visual_source": "apps/ui-layout-demo/sidebar.html",
    "implementation_status": "not-started",
    "boss_visual_signoff": null,
    "root_function_signoff": null
  },
  {
    "capability_id": "media.write",
    "route": "none",
    "prd_status": "not-planned",
    "contract_status": "missing",
    "root_evidence": "codex/integration-control@68da060:docs/plans/2026-08-25-多租户身份与奇航主链-implementation.md",
    "states": ["disabled"],
    "old_non_visual_code": [],
    "visual_source": "none: no runtime entry",
    "implementation_status": "not-started",
    "boss_visual_signoff": null,
    "root_function_signoff": null
  }
]
```
<!-- capability-matrix:end -->

## 准入规则

能力只有同时满足以下条件，才可从 `not-started/blocked` 进入正式页面：

1. root 提供实现 SHA、fixture、权限边界和验收条件。
2. 前端为 schema 漂移、空值、零值、partial、stale、forbidden 与 request ID 写回归测试。
3. 老板确认页面视觉；root 确认功能、权限和状态。
4. 自动门禁、老板视觉签字、root 功能签字三者分别记录，不互相冒充。
