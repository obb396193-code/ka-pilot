# 多用户常驻 Runtime 直接执行器 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不把单人机器人高权限模式搬进产品的前提下，为 KA 平台增加可插拔、按用户授权、可确认和可审计的 RuntimeExecutor，并逐渠道验证直接读写能力。

**Architecture:** 继续由 Web/API 与 DingTalk Gateway 承担身份和入口，Worker 负责 Job 与变更集，Capability Registry 决定能力与执行后端。RuntimeExecutor 部署在经授权的 Multica/OS Runtime，只接收签名结构化命令；MulticaRunExecutor 保留兜底，正式服务接口成熟后逐能力迁移到 ProductDirectExecutor。

**Tech Stack:** TypeScript 5.9、Node.js、Zod、PostgreSQL、Vitest、现有 `@ka/domain` Capability Registry、`@ka/worker` Changeset Handler、Multica/OS Runtime、DingTalk Stream。

---

## 开工前置

- 从 Claude/arch 审核后的后端集成基线开分支；不得从 `fe/f001` 开发后端。
- 必须先取得 `dingtalk-bot-migrate.tar.gz`，本阶段只读解包到仓库外临时目录，不直接复制进运行仓。
- 任何真实写探针仍遵守“预览→老板确认→执行”；本计划中的自动化测试只能使用 fake transport 或无副作用读接口。
- `tt.sh` 默认标记 `TOUTIAO_ONLY`；`tools.py`、`deduct.py` 在源码和真实探针完成前标记 `UNVERIFIED_SCOPE`。

### Task 1: 源码包取证与复用审计

**Files:**
- Create: `docs/evidence/integration/2026-08-24-dingtalk-bot-source-audit.md`
- Create: `docs/evidence/integration/2026-08-24-runtime-capability-matrix.json`
- Modify: `docs/08-平台能力实证.md`

**Step 1: 校验附件而不执行**

将附件放到仓库外临时目录，记录文件大小和 SHA-256；只使用 `tar -tzf` 列目录，不运行脚本。

Run: `shasum -a 256 /path/to/dingtalk-bot-migrate.tar.gz`

Expected: 输出一个 SHA-256；报告只记录 hash、文件数和相对路径，不记录凭证内容。

**Step 2: 安全解包并扫描**

Run: `mkdir -p /private/tmp/ka-dingtalk-bot-audit`

Run: `tar -xzf /path/to/dingtalk-bot-migrate.tar.gz -C /private/tmp/ka-dingtalk-bot-audit`

Run: `rg -n "TOUTIAO|KUAISHOU|TENCENT|BAIDU|Proxy-Authorization|18082|echo y|subprocess|shell=True|CLAUDE.md" /private/tmp/ka-dingtalk-bot-audit`

Expected: 能按文件定位渠道常量、MITM 调用、Shell 边界与知识写入点；不得输出 `.env` 中的值。

**Step 3: 逐文件分级**

在审计报告中对 `bot.py/tools.py/cache.py/config.py/deduct.py/tt.sh/agent.py/CLAUDE.md` 标记：

- `reuse_pattern`：只借鉴模式；
- `adapt_source`：允许在许可证和归属明确后改造；
- `channel_specific`：渠道专属；
- `reject`：共享高权凭证、任意 Shell、绕确认、群消息直接写系统提示等；
- `unverified`：缺 endpoint/权限/真实执行证据。

**Step 4: 生成能力矩阵**

JSON 每项至少包含：`capabilityId/channel/operation/readWrite/sourceFile/authPath/confirmation/runtimeEvidence/status`。未知项必须是 `unverified`，不能猜成 `supported`。

**Step 5: 提交证据**

```bash
git add docs/evidence/integration/2026-08-24-dingtalk-bot-source-audit.md docs/evidence/integration/2026-08-24-runtime-capability-matrix.json docs/08-平台能力实证.md
git commit -m "证据：审计钉钉机器人运行时与渠道能力"
```

### Task 2: 扩展 Capability Registry 的渠道与执行后端元数据

**Files:**
- Modify: `packages/domain/src/capability-registry.ts`
- Modify: `packages/domain/test/capability-registry.test.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: 写失败测试**

新增测试要求能力显式声明：

```ts
channel: "TOUTIAO" | "KUAISHOU" | "TENCENT" | "BAIDU" | "PLATFORM";
executorKinds: readonly ("product_direct" | "runtime" | "multica_run")[];
runtimeVerification: "unverified" | "documented" | "runtime_verified";
```

测试拒绝空执行器、重复执行器、未知渠道，以及 `execute + runtime_verified` 但没有 simulation/confirmation 的能力。

Run: `npm --prefix packages/domain test -- capability-registry.test.ts`

Expected: FAIL，因为现有定义没有三项元数据。

**Step 2: 最小实现**

扩展 `CapabilityDefinition` 和校验函数；不在这一任务注册任何真实媒体能力。

**Step 3: 运行目标测试和全量测试**

Run: `npm --prefix packages/domain test -- capability-registry.test.ts`

Expected: PASS。

Run: `npm --prefix packages/domain test`

Expected: 全量 PASS。

**Step 4: 提交**

```bash
git add packages/domain/src/capability-registry.ts packages/domain/src/index.ts packages/domain/test/capability-registry.test.ts
git commit -m "功能：扩展渠道能力与执行后端元数据"
```

### Task 3: 建立按用户、渠道和后端的授权档案

**Files:**
- Create: `packages/db/migrations/005_execution_credentials.cjs`
- Create: `packages/db/src/execution-credential-repository.ts`
- Create: `packages/db/test/execution-credential-repository.test.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/contract/schema.sql`
- Modify: `packages/contract/api.md`

**Step 1: 写迁移失败测试**

在 DB 测试中要求 `execution_credentials` 至少包含：workspace、user、channel、executor_kind、secret_ref、scope_json、status、last_verified_at、revoked_at、metadata；唯一键为 `(workspace_id,user_id,channel,executor_kind)`。

Run: `npm --prefix packages/db test -- migrations.test.ts`

Expected: FAIL，表不存在。

**Step 2: 实现迁移和 Repository**

Repository 只返回引用和元数据，不返回 Secret 明文；实现 `resolveActiveBinding`、`markVerified`、`revoke`。`resolveActiveBinding` 必须同时校验 workspace、user、channel、executor kind 和 active 状态。

**Step 3: 增加 API 合同**

新增：

- `GET /api/v1/integrations/execution-credentials`
- `POST /api/v1/integrations/execution-credentials`
- `POST /api/v1/integrations/execution-credentials/:id/verify`
- `DELETE /api/v1/integrations/execution-credentials/:id`

请求只接受 Secret reference 或交给内部 Secret 服务的密文上传句柄，不接受把凭证写进日志或 Job payload。

**Step 4: 运行 DB 全量测试**

Run: `npm --prefix packages/db test`

Expected: 全量 PASS，迁移可 down/up 重放。

**Step 5: 提交**

```bash
git add packages/db packages/contract/schema.sql packages/contract/api.md
git commit -m "功能：增加多用户执行授权档案"
```

### Task 4: 冻结 Runtime Executor 签名协议

**Files:**
- Create: `packages/domain/src/runtime-executor-protocol.ts`
- Create: `packages/domain/test/runtime-executor-protocol.test.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: 写失败测试**

定义严格请求 envelope，覆盖：capability/version、workspace、initiator、credential owner、channel、account scope、mode、parameters、changeset、confirmation、idempotency、issuedAt/expiresAt、traceId。测试拒绝额外字段、过期、用户替换、空账户范围和 execute 缺 confirmation。

Run: `npm --prefix packages/domain test -- runtime-executor-protocol.test.ts`

Expected: FAIL，协议尚不存在。

**Step 2: 最小实现**

用 Zod `.strict()` 定义 DTO，并提供 canonical JSON 和 HMAC-SHA256 签名/验证函数。签名 key 只通过调用方注入，不进入 DTO。

**Step 3: 验证不可变和重放边界**

增加测试：参数 key 顺序不影响签名；改任意 actor/account/parameter 后签名失效；同 idempotency key 可识别重放。

**Step 4: 运行 Domain 全量测试并提交**

```bash
npm --prefix packages/domain test
git add packages/domain/src/runtime-executor-protocol.ts packages/domain/src/index.ts packages/domain/test/runtime-executor-protocol.test.ts
git commit -m "功能：冻结Runtime执行器签名协议"
```

### Task 5: 实现 Worker 侧执行器路由与 Runtime Client

**Files:**
- Create: `apps/worker/src/executors/types.ts`
- Create: `apps/worker/src/executors/router.ts`
- Create: `apps/worker/src/executors/runtime-client.ts`
- Create: `apps/worker/src/executors/multica-run-adapter.ts`
- Create: `apps/worker/test/executors/router.test.ts`
- Create: `apps/worker/test/executors/runtime-client.test.ts`
- Modify: `apps/worker/src/config.ts`

**Step 1: 写路由失败测试**

测试只在能力、渠道、授权档案、Runtime 健康和验证等级均满足时选择 `runtime`；否则降级 `multica_run` 或显式 blocked，禁止静默换成其他用户凭证。

**Step 2: 写 HTTP Client 失败测试**

Fake fetch 验证固定 base URL、无 redirect、请求签名、超时、有界响应、稳定错误枚举；确保日志不含 Secret、完整 payload 和媒体原始响应。

**Step 3: 最小实现并运行测试**

Run: `npm --prefix apps/worker test -- executors`

Expected: PASS。

**Step 4: 全量门禁并提交**

```bash
npm --prefix apps/worker test
npm --prefix apps/worker run typecheck
npm --prefix apps/worker run lint
git add apps/worker/src/executors apps/worker/test/executors apps/worker/src/config.ts
git commit -m "功能：增加可插拔媒体执行器路由"
```

### Task 6: 创建独立 Runtime Executor 服务

**Files:**
- Create: `apps/runtime-executor/package.json`
- Create: `apps/runtime-executor/tsconfig.json`
- Create: `apps/runtime-executor/src/config.ts`
- Create: `apps/runtime-executor/src/server.ts`
- Create: `apps/runtime-executor/src/request-verifier.ts`
- Create: `apps/runtime-executor/src/idempotency-store.ts`
- Create: `apps/runtime-executor/src/capability-dispatcher.ts`
- Create: `apps/runtime-executor/test/request-verifier.test.ts`
- Create: `apps/runtime-executor/test/server.test.ts`
- Create: `apps/runtime-executor/.env.example`

**Step 1: 写安全边界失败测试**

覆盖：签名错误、过期、未知 capability、账户越界、execute 缺确认、重复冲突、任意 URL、请求体过大、响应体过大。所有情况必须 fail-closed。

**Step 2: 实现最小健康服务**

仅实现 `/healthz`、`/v1/capabilities`、`/v1/execute`。健康结果只暴露 daemon/mitm/cli 的布尔或枚举状态，不回传环境变量、路径和身份字段。

**Step 3: 实现持久幂等接口**

先定义 `IdempotencyStore` port；测试环境用内存实现，生产实现必须在下一任务接产品 DB 或 Runtime 可持久化存储。不得把进程内 Map 冒充生产完成。

**Step 4: 运行门禁并提交**

```bash
npm --prefix apps/runtime-executor test
npm --prefix apps/runtime-executor run typecheck
npm --prefix apps/runtime-executor run lint
git add apps/runtime-executor
git commit -m "功能：建立受控Runtime执行服务骨架"
```

### Task 7: 逐渠道实现 Adapter，先字节再快手

**Files:**
- Create: `apps/runtime-executor/src/adapters/toutiao/*.ts`
- Create: `apps/runtime-executor/src/adapters/kuaishou/*.ts`
- Create: `apps/runtime-executor/test/adapters/toutiao.test.ts`
- Create: `apps/runtime-executor/test/adapters/kuaishou.test.ts`
- Modify: `apps/runtime-executor/src/capability-dispatcher.ts`
- Modify: `docs/evidence/integration/2026-08-24-runtime-capability-matrix.json`

**Step 1: 从源码审计结果冻结字节 Adapter**

只迁移已确认 endpoint、参数和错误码；Shell wrapper 优先改为参数数组的受控进程调用，禁止字符串拼接和 `shell:true`。写能力先实现 preview，execute 默认关闭。

**Step 2: 写字节 Fake Transport 测试**

测试预算、出价、启停或扣量中的一个只读/preview 能力；确认媒体字段不会泄漏到其他 Adapter。

**Step 3: 独立实现快手 Adapter**

基于已实证 `kuaishou-cli` 能力和快手 Schema 实现，不复用 `tt.sh` 的 payload。至少选择一个只读能力和一个可恢复低风险 preview；execute 仍由真实探针门控制。

**Step 4: 运行跨渠道隔离测试**

Run: `npm --prefix apps/runtime-executor test -- adapters`

Expected: 字节请求不能路由到快手 Adapter，反之亦然；未验证媒体返回 `capability_not_verified`。

**Step 5: 提交**

```bash
git add apps/runtime-executor/src/adapters apps/runtime-executor/test/adapters docs/evidence/integration/2026-08-24-runtime-capability-matrix.json
git commit -m "功能：增加字节与快手隔离执行适配器"
```

### Task 8: 接入现有变更集执行闭环

**Files:**
- Modify: `apps/worker/src/changesets/changeset-execution-handler.ts`
- Modify: `apps/worker/src/changesets/types.ts`
- Create: `apps/worker/src/changesets/routed-change-executor.ts`
- Create: `apps/worker/test/changesets/routed-change-executor.test.ts`

**Step 1: 写失败测试**

覆盖：preview 证据缺失不执行；执行前 from-value 再检查；Runtime 超时写为 UNKNOWN；UNKNOWN 只能 reconcile；相同 changeset 不重复写；路由变化不能改变 credential owner。

**Step 2: 实现 RoutedChangeExecutor**

让现有 `ChangeSetExecutionHandler` 继续负责状态机，只替换 `ChangeExecutor` port 的具体实现。不要在 Runtime Adapter 里复制变更集状态机。

**Step 3: 运行 Worker 全量测试并提交**

```bash
npm --prefix apps/worker test
git add apps/worker/src/changesets apps/worker/test/changesets
git commit -m "功能：把Runtime执行器接入变更集闭环"
```

### Task 9: 接入管理与钉钉身份联动

**Files:**
- Modify: `apps/dingtalk-gateway/src/message-handler.ts`
- Modify: `apps/dingtalk-gateway/src/product-api-client.ts`
- Modify: `apps/dingtalk-gateway/test/message-handler.test.ts`
- Modify: `packages/contract/api.md`

**Step 1: 写失败测试**

未绑定用户只返回接入管理深链；已绑定但无写授权只允许查数/建议；写请求必须生成变更集卡片或 Web 深链，不能直接调用 Runtime。

**Step 2: 最小实现**

Gateway 继续不持有媒体凭证，只向 Product API 传钉钉身份和意图。Product API 返回统一的 `reply/action_card/deep_link` 结果；Gateway 不自行判断账户权限。

**Step 3: 运行测试并提交**

```bash
npm --prefix apps/dingtalk-gateway test
git add apps/dingtalk-gateway packages/contract/api.md
git commit -m "功能：接入多用户执行授权与钉钉入口"
```

### Task 10: 真实只读与受控写 E2E

**Files:**
- Create: `docs/evidence/integration/YYYY-MM-DD-runtime-executor-read-e2e.md`
- Create: `docs/evidence/integration/YYYY-MM-DD-runtime-executor-write-e2e.md`
- Modify: `docs/22-验收基线总档.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: 先跑只读链路**

验证：钉钉用户→平台身份→授权档案→产品 Job→Runtime→渠道 Adapter→结构化回执。记录 trace/job/event ID 的脱敏映射和总耗时。

**Step 2: 老板确认后跑单个可恢复写操作**

先生成 dry-run 和变更集；老板明确确认后执行；随后只读查询核实结果，再生成反向变更集恢复。未经确认不得执行。

**Step 3: 验证双执行器一致性**

对同一只读能力分别走 RuntimeExecutor 和 MulticaRunExecutor，比较统一 envelope、对象范围与错误分类；业务值差异必须解释数据截止时间，不能用 LLM 文本判断相等。

**Step 4: 更新验收状态和审查信箱**

只把真实跑过的能力标 `runtime_verified`；其余继续 `documented/unverified`。

**Step 5: 提交**

```bash
git add docs/evidence/integration docs/22-验收基线总档.md docs/plans/工作台账.md docs/relay/inbox-arch.md
git commit -m "证据：完成Runtime执行器受控联调"
```

## 总门禁

每批提交前运行：

```bash
npm --prefix packages/domain test
npm --prefix packages/db test
npm --prefix apps/worker test
npm --prefix apps/dingtalk-gateway test
npm --prefix apps/runtime-executor test
```

并分别执行 `typecheck`、`lint`、`npm audit`。生产启用还必须满足：Secret 服务、授权撤销、Runtime 健康、持久幂等、写操作确认、UNKNOWN 对账、审计映射和回滚演练全部通过。
