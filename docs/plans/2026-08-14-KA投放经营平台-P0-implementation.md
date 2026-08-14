# KA 投放经营平台 P0 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建成“今日待处理 → 证据分析 → 变更预览 → 确认执行 → Multica 对账 → 效果回收”的 P0 真实闭环，同时保留未来语义层、自助报表和工作流扩展边界。

**Architecture:** 采用 TypeScript monorepo：Next.js Web、Fastify 业务 API、独立 Worker、独立钉钉 Gateway，共享领域模型和 UI 包。读数据经已验证的产品数据适配器进入语义层；确定性规则生成工作项；Claude Agent SDK 只负责分析与结构化草稿；媒体写操作由持久工作流通过 Multica Connector 执行。

**Tech Stack:** TypeScript, Next.js, Fastify, PostgreSQL/RDS, Redis-compatible queue, Vitest, Playwright, Zod, Drizzle ORM, Claude Agent SDK, DingTalk Stream SDK.

> 本计划是设计后的实施草案，不代表已获准开工。正式执行前需要创建独立 worktree，并重新核对公司内网可用依赖、RDS/缓存申请方式、SSO 接入和 Multica 接口契约。

---

## 0. 目标仓库结构

```text
apps/
├── web/                 # Next.js 页面和 BFF
├── api/                 # 业务 API
├── worker/              # ETL、诊断、工作流、效果回收、Agent
└── message-gateway/     # 钉钉 Stream、互动卡片和推送
packages/
├── domain/              # 任务、账户、策略、工作流、变更集领域模型
├── db/                  # Drizzle schema 和迁移
├── semantic/            # 指标、维度、数据视图和数据健康
├── workflow/            # DSL、校验、状态机、幂等和对账
├── agent-tools/         # 产品 Agent 工具与结构化输出
├── ui/                  # 设计系统与共享组件
└── test-fixtures/       # 全部脱敏虚构测试数据
tests/
├── contract/
├── integration/
└── e2e/
```

## Task 1: 建立可测试的 monorepo 骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `apps/worker/package.json`
- Create: `apps/message-gateway/package.json`
- Create: `packages/domain/package.json`
- Test: `tests/contract/workspace.test.ts`

**Steps:**

1. 写失败测试：验证四个 app 和六个核心 package 均可被 workspace 解析。
2. 运行 `pnpm vitest run tests/contract/workspace.test.ts`，预期因 workspace 不存在而失败。
3. 创建最小 workspace、统一 TypeScript/Vitest 配置和 `check` 脚本。
4. 运行 `pnpm install && pnpm check`，预期通过。
5. 提交：`git commit -m "搭建投放经营平台 monorepo 骨架"`。

## Task 2: 定义核心领域对象与边界

**Files:**
- Create: `packages/domain/src/task.ts`
- Create: `packages/domain/src/strategy.ts`
- Create: `packages/domain/src/workflow.ts`
- Create: `packages/domain/src/work-item.ts`
- Create: `packages/domain/src/change-set.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/src/domain.test.ts`

**Steps:**

1. 写失败测试，固定 `Strategy` 只描述版位/投法/RTA/出价/预算/账户/商品素材/阶段打法，`WorkflowDefinition` 描述动作图，`AutomationRule` 只引用已发布工作流版本。
2. 增加固定目标快照和动态对象选择器的互斥校验测试。
3. 运行 `pnpm --filter @ka/domain test`，预期失败。
4. 用 Zod 实现最小领域 schema 和序列化类型。
5. 重新运行测试并提交：`git commit -m "定义任务策略工作流核心领域模型"`。

## Task 3: 建立数据库 schema 和脱敏 fixture

**Files:**
- Create: `packages/db/src/schema/*.ts`
- Create: `packages/db/src/migrations/0001_core.sql`
- Create: `packages/test-fixtures/src/demo.ts`
- Test: `packages/db/src/schema.test.ts`

**Steps:**

1. 写失败测试，覆盖 task、account、strategy、workflow_definition、workflow_run、node_run、change_set、work_item、metric_snapshot、effect_feedback、audit_entry。
2. 校验所有媒体对象使用内部 surrogate key，原始外部 ID 通过受控映射保存。
3. 创建 Drizzle schema、唯一键、版本键和必要索引。
4. 在临时数据库执行迁移并运行测试。
5. 提交：`git commit -m "建立P0数据库模型和脱敏测试数据"`。

## Task 4: 实现读数据适配器与数据健康

**Files:**
- Create: `apps/worker/src/connectors/qihang.ts`
- Create: `apps/worker/src/jobs/sync-metrics.ts`
- Create: `packages/semantic/src/health.ts`
- Test: `tests/integration/data-sync.test.ts`

**Steps:**

1. 写合同测试，使用脱敏 HTTP fixture 验证账户、账户实时和广告实时数据的字段映射。
2. 写失败场景：超时、分页、空结果、离线缺行实时补洞、数据源标记。
3. 实现适配器，不在代码中写 appCode、userId 或公司地址，全部使用配置引用。
4. 生成 freshness、coverage、missing、gap-filled 和 metric-version 状态。
5. 运行集成测试并提交：`git commit -m "接入投放数据同步和数据健康"`。

## Task 5: 建立认证语义层

**Files:**
- Create: `packages/semantic/src/entities.ts`
- Create: `packages/semantic/src/metrics.ts`
- Create: `packages/semantic/src/dataset-views.ts`
- Create: `packages/semantic/src/query-plan.ts`
- Test: `packages/semantic/src/semantic.test.ts`

**Steps:**

1. 写失败测试，覆盖消耗、转化、实际成本、考核价、达成率及任务/账户/广告粒度限制。
2. 写粒度冲突和必填时间范围测试。
3. 实现认证 Metric、Dimension、Segment 和任务经营 Dataset View。
4. 输出可审计 QueryPlan，记录指标版本、时间、筛选和数据健康。
5. 运行测试并提交：`git commit -m "建立投放指标语义层"`。

## Task 6: 实现今日待处理与效果回收领域服务

**Files:**
- Create: `apps/worker/src/diagnostics/rules.ts`
- Create: `apps/worker/src/jobs/generate-work-items.ts`
- Create: `apps/worker/src/jobs/collect-effects.ts`
- Create: `apps/api/src/routes/work-items.ts`
- Test: `tests/integration/work-items.test.ts`

**Steps:**

1. 写失败测试：异常去重、忽略冷却、证据快照、优先级、负责人和来源。
2. 写 T+1/自定义观察窗后的改善、无效、恶化判定测试。
3. 实现确定性规则，不让 LLM 计算指标或决定异常是否成立。
4. 暴露列表、处理、忽略、待观察和效果回收 API。
5. 运行测试并提交：`git commit -m "实现今日工作项和效果回收闭环"`。

## Task 7: 实现工作流 DSL 与可靠状态机

**Files:**
- Create: `packages/workflow/src/dsl.ts`
- Create: `packages/workflow/src/validate.ts`
- Create: `packages/workflow/src/state-machine.ts`
- Create: `packages/workflow/src/retry.ts`
- Create: `packages/workflow/src/locks.ts`
- Test: `packages/workflow/src/workflow.test.ts`

**Steps:**

1. 写失败测试，覆盖十类领域节点、强类型输入输出、不可达节点和确认门缺失。
2. 写运行状态、服务重启恢复、不可变版本和账户级写锁测试。
3. 写不同副作用节点的重试策略：READ、CALCULATE、AI、WRITE、NON_IDEMPOTENT_CREATE。
4. 实现最小数据库驱动状态机，不在 P0 自研通用分布式编排平台。
5. 运行测试并提交：`git commit -m "实现可恢复的投放工作流引擎"`。

## Task 8: 实现变更集、确认和 Multica 对账

**Files:**
- Create: `packages/workflow/src/change-set.ts`
- Create: `packages/workflow/src/confirmation.ts`
- Create: `apps/worker/src/connectors/multica.ts`
- Create: `apps/worker/src/jobs/reconcile-media-actions.ts`
- Test: `tests/integration/media-write.test.ts`

**Steps:**

1. 写失败测试：固定对象快照、before/after、影响范围、hash、确认人和过期失效。
2. 写幂等回调、重复确认、响应丢失、UNKNOWN、对账成功和禁止盲目重试测试。
3. 实现 Multica Connector 接口与 mock transport；真实协议待内网合同测试后替换。
4. 实现确认恢复状态机和执行后回查。
5. 运行测试并提交：`git commit -m "完成媒体写操作确认与对账"`。

## Task 9: 实现产品 Agent 的只读分析与结构化草稿

**Files:**
- Create: `packages/agent-tools/src/context.ts`
- Create: `packages/agent-tools/src/query.ts`
- Create: `packages/agent-tools/src/work-item.ts`
- Create: `packages/agent-tools/src/change-set-draft.ts`
- Create: `apps/worker/src/agent/runtime.ts`
- Test: `packages/agent-tools/src/agent-tools.test.ts`

**Steps:**

1. 写失败测试：明确选择对象优先、每次调用重新鉴权、新会话默认清空。
2. 写结构化输出测试：结论、证据、动作、QueryPlan 和确定性/模型标签。
3. 实现 Claude Agent SDK Runtime 与可替换模型网关接口；密钥只来自环境配置。
4. 只允许 Agent 生成分析、待办、报告、工作流或变更集草稿，禁止直接执行写操作。
5. 运行测试并提交：`git commit -m "接入产品内Agent和结构化工具"`。

## Task 10: 实现 Web 设计系统与六模块壳

**Files:**
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/components/*`
- Create: `apps/web/app/(workspace)/layout.tsx`
- Create: `apps/web/app/(workspace)/my-work/page.tsx`
- Create: `apps/web/app/(workspace)/tasks/page.tsx`
- Create: `apps/web/app/(workspace)/tasks/[id]/page.tsx`
- Test: `apps/web/tests/workspace.test.tsx`

**Steps:**

1. 写组件测试，固定六项导航、角色化首页和全局 Agent 抽屉位置。
2. 从 v2 原型提炼颜色、字号、间距、边框、状态和表格密度 token。
3. 实现壳、我的工作、任务库和任务详情静态版本。
4. 接入 P0 API，补加载、空、延迟、权限不足和数据不新鲜状态。
5. 运行组件测试并提交：`git commit -m "实现P0工作台和任务控制台"`。

## Task 11: 实现钉钉 Gateway 和互动卡片

**Files:**
- Create: `apps/message-gateway/src/stream.ts`
- Create: `apps/message-gateway/src/cards/*.ts`
- Create: `apps/message-gateway/src/actions.ts`
- Create: `apps/message-gateway/src/retry.ts`
- Test: `tests/integration/dingtalk-cards.test.ts`

**Steps:**

1. 写失败测试，覆盖 L0 查询、L1 确认、L2 变更集确认、L3 跳 Web 四级动作。
2. 写按钮回调身份、权限、有效期、hash、防重放和重复事件测试。
3. 实现查询、待确认、执行中、成功、部分成功和失败卡片模板。
4. 接入产品 API 和工作流恢复接口；本任务暂不实现群数据范围治理。
5. 运行测试并提交：`git commit -m "接入钉钉互动卡片工作流"`。

## Task 12: 完成审计、端到端验证与灰度入口

**Files:**
- Create: `apps/api/src/audit/*.ts`
- Create: `apps/api/src/feature-flags.ts`
- Create: `tests/e2e/daily-loop.spec.ts`
- Create: `tests/e2e/dingtalk-confirmation.spec.ts`
- Create: `docs/runbooks/P0-灰度与回滚.md`

**Steps:**

1. 写 E2E：登录 → 今日待处理 → 查看证据 → Agent 分析 → 生成变更集 → 确认 → mock Multica → 对账 → 效果回收。
2. 写钉钉卡片确认和重复点击 E2E。
3. 验证业务动作账本、工作流节点记录、Agent Trace 和受限原始日志四层审计。
4. 增加按用户和任务灰度开关、紧急停止和回滚运行手册。
5. 运行 `pnpm check && pnpm test:e2e`，预期全部通过。
6. 提交：`git commit -m "完成P0闭环端到端验证和灰度能力"`。

## 执行前必须再次拍板

1. 正式代码仓库、包管理器和内网依赖镜像；
2. P0 首个真实媒体写动作及其批量上限；
3. BUC/组织身份与账户归属的最终映射方式；
4. RDS、缓存、队列和对象存储的申请结果；
5. Multica 请求、回执、查询和 correlation ID 的真实合同；
6. 2—3 位灰度用户和一组脱敏测试任务。

