# 后端交接与联调准备 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不触碰 Claude 前端现场、不发明外部协议的前提下，完成后端总账更新、可执行合并清单、Qihang 资源上限、可复现性能基线和真实通路联调清单。

**Architecture:** 继续在 `be/b8a` 独立工作树工作。Qihang 客户端只增加配置化、fail-closed 的输入/响应资源预算，不改变业务响应语义；性能工具只使用脱敏合成数据并输出测量证据，不把本机结果冒充生产 SLA。合并与联调产物只记录已验证事实、冲突路径、前置条件和回滚点。

**Tech Stack:** TypeScript 5.9、Node.js 24、Vitest、Web Fetch Streams、PostgreSQL 16、Git

---

## 边界

1. 不修改 `/Users/aik/Desktop/投放agent` 的 `fe/f001` 工作树和 Claude 未提交文件。
2. 不修改公开 API DTO、业务表语义、Multica/OS 未证实协议或真实凭证。
3. 性能报告只写当前机器、合成规模和调用次数；没有内网真实账户数据时不宣称生产吞吐。
4. 所有样本使用假 workspace/account/user，不落真实账户 ID、金额、考核价或人名。

### Task 1: 冻结合并事实与交接清单

**Files:**
- Create: `docs/plans/2026-08-20-be-b8a与fe-f001合并清单.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 读取共同基线与双方变更**

Run:

```bash
git merge-base fe/f001 be/b8a
git diff --name-only <merge-base>..fe/f001
git diff --name-only <merge-base>..be/b8a
git -C /Users/aik/Desktop/投放agent status --short
```

Expected: 共同基线和提交/未提交交集可机械复算；不修改前端工作树。

**Step 2: 写合并清单**

记录：分支 SHA、共同基线、前后端提交数、已提交重叠、未提交重叠、建议合并顺序、每个冲突文件的保留原则、合并后必跑门禁和回滚方式。明确禁止在 Claude 脏工作树直接 merge。

**Step 3: 更新后端总账**

将 B8a 后续自审修复、测试真相、剩余 P0/P1 和最新审查入口 P-014 写入总账；保留“尚未审核/尚未合并/尚未真实联调”的边界。

**Step 4: 校验 Markdown 路径和 Git 事实**

Run:

```bash
git diff --check
git branch --contains <repair-head>
```

Expected: 路径存在，修复仍只属于 `be/b8a`。

**Step 5: Commit**

```bash
git add docs/plans
git commit -m "[交接] 冻结后端合并清单与最新总账"
```

### Task 2: Qihang 输入与响应资源预算

**Files:**
- Modify: `apps/worker/src/qihang/client.ts`
- Modify: `apps/worker/src/qihang/errors.ts`
- Modify: `apps/worker/test/qihang-client.test.ts`
- Modify: `apps/worker/src/etl/payload.ts`
- Modify: `apps/worker/src/backfill/payload.ts`
- Modify: affected payload tests if needed

**Step 1: Write failing tests**

新增反例：

1. `Content-Length` 超 `maxResponseBytes` 时不读取正文并抛稳定资源限制错误。
2. 无 `Content-Length` 的分块响应累计超限时取消读取并失败。
3. 成功响应 `rows` 超 `maxRows` 时拒绝返回。
4. accountIds/adIds 超 `maxIdsPerQuery` 时发请求前失败。
5. 非法零值、负值、非整数限制配置在构造时失败。

**Step 2: Run test to verify RED**

Run:

```bash
cd apps/worker && npm test -- --run test/qihang-client.test.ts
```

Expected: 新反例因当前无界 `response.text()`、rows 和 ID 数组失败。

**Step 3: Implement minimal bounded reader**

- 新增 `QihangResourceLimitError`，稳定 code 不包含响应正文。
- 默认 `maxResponseBytes=10 MiB`、`maxRows=10_000`、`maxIdsPerQuery=1_000`，均可通过构造参数在内网联调后收紧。
- 先检查合法 `Content-Length`，再使用 `ReadableStream.getReader()` 按字节累计；超限取消 reader。
- 成功解析后按资源结果行数复核；请求前同时复核 accountIds/adIds 数量。
- 资源限制不重试，避免重复放大上游压力。

**Step 4: Run focused tests, typecheck and lint**

Run:

```bash
cd apps/worker
npm test -- --run test/qihang-client.test.ts test/etl-handlers.test.ts test/backfill-coordinator.test.ts
npm run typecheck
npm run lint
```

Expected: 全绿；资源限制错误只执行一次请求。

**Step 5: Commit**

```bash
git add apps/worker
git commit -m "[安全] 限制启航请求与响应资源"
```

### Task 3: 可复现数据链性能基线

**Files:**
- Create: `apps/worker/scripts/benchmark-data-pipeline.ts`
- Modify: `apps/worker/package.json`
- Modify: `apps/worker/tsconfig.json`
- Create: `apps/worker/test/benchmark-data-pipeline.test.ts`
- Create: `docs/evidence/B8a-数据链性能基线.md`

**Step 1: Write failing benchmark contract test**

要求 benchmark runner：

- 只接受 `100/1_000/5_000` 等正整数合成规模；
- 输出 JSON，含 runtime、Node 版本、样本数、总耗时、每秒处理量、Canonical port 调用次数和 Qihang JSON 字节数；
- 默认不访问网络、不访问真实数据库、不包含真实业务标识；
- 固定时钟/假端口时输出结构稳定。

**Step 2: Run test to verify RED**

Run:

```bash
cd apps/worker && npm test -- --run test/benchmark-data-pipeline.test.ts
```

Expected: benchmark module 尚不存在。

**Step 3: Implement benchmark runner**

使用现有 `createCanonicalHandler` 与 `QihangClient`，生成脱敏 synthetic rows；Canonical 记录 `load settings/history/upsert` 调用数，Qihang 使用本地 Response 测量 JSON 解析与资源预算，不写数据库。

**Step 4: Run three scales and write evidence**

Run:

```bash
cd apps/worker
npm run benchmark:data -- --accounts=100,1000,5000
```

Expected: 输出三个规模的 JSON。报告必须同时写清当前 Canonical 仍为每行 settings/history/upsert 的线性调用模型，不能把合成端口吞吐当生产 SLA。

**Step 5: Commit**

```bash
git add apps/worker docs/evidence
git commit -m "[性能] 建立数据链合成压测基线"
```

### Task 4: 真实通路联调准备与最终质检

**Files:**
- Create: `docs/plans/2026-08-20-真实通路联调准备清单.md`
- Modify: `docs/relay/inbox-arch.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Create: `docs/evidence/B8a-交接准备代码质量报告.md`

**Step 1: 写联调矩阵**

逐条覆盖启航只读、Multica/OS read/preview/execute、Secret 服务、模型网关、钉钉 Stream、PostgreSQL/FaaS。每项记录 owner、所需凭证类型、网络位置、最小探针、成功证据、失败分级、是否允许写、回滚/撤销和禁止记录的敏感信息。

**Step 2: 写 P-015 审查入口**

列出合并清单、资源预算、性能基线、联调前置条件及 Claude 需要裁决的唯一事项；不得把 fake upstream 记为真实联通。

**Step 3: Run full quality gate**

四包默认 tests、Worker opt-in 真 SDK smoke、typecheck、lint、coverage、DB migration replay、dependency audit、diff check、secret/dynamic execution scan、complexity≤10、单函数≤100 行。

**Step 4: Update final ledger**

总账写最新代码 SHA、证据 SHA、测试数和仍未完成项；台账记录本批动作和结果。

**Step 5: Commit**

```bash
git add docs
git commit -m "[质检] 完成后端交接与联调准备"
```
