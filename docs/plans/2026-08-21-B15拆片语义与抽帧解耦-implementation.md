# B15 拆片语义与抽帧解耦 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让整段 ASR 在不伪造时间的前提下输出多段文稿结构，并补齐可供页面集中浏览的逐镜头帧墙。

**Architecture:** 保持视觉镜头时间轴和文稿语义结构为两套独立真相。Domain 用 `semanticSections + alignmentStatus + segments` 区分无时间语义和精确时间结构；Worker 复用现有镜头代表帧生成分页帧墙，并把 film/transcript/analysis 一并作为内部结果交给未来 API。

**Tech Stack:** TypeScript 5.9、Zod 4、Vitest、FFmpeg/FFprobe、Claude Agent SDK 0.3.235。

---

### Task 1: 拆片结果的双时间轴领域契约

**Files:**
- Modify: `packages/domain/src/material-teardown.ts`
- Modify: `packages/domain/test/material-teardown.test.ts`

**Step 1: Write the failing tests**

- 整段字幕结果包含两个连续 `order` 的 `semanticSections`、`alignmentStatus=unavailable_whole_video`、空 `segments` 时通过。
- 整段字幕输出非空 `segments` 时拒绝。
- 整段字幕的语义段没有引用全文字幕证据时拒绝。
- `segment` 字幕要求 `alignmentStatus=exact_transcript_timing`，且 `segments` 继续完整覆盖全片。
- `semanticSections.order` 缺号、重复或从 0 开始时拒绝。

**Step 2: Run tests to verify RED**

Run: `npm test -- --run test/material-teardown.test.ts`

Expected: 新字段尚不存在或旧的“只能一个 other 段”断言失败。

**Step 3: Implement the minimal contract**

- 增加 `semanticSectionSchema` 和 `alignmentStatus`。
- `segments` 允许空数组；根据字幕精度执行条件校验。
- 删除“whole_video 只能一个全片 other 段”的旧校验。
- 连续验证 `semanticSections.order`。
- whole-video 语义段必须引用唯一全文字幕证据；不得借 shot ID 暗示逐镜头语义映射。
- 将新字段证据引用纳入 `collectEvidenceIds` 和冻结结果。

**Step 4: Run tests to verify GREEN**

Run: `npm test -- --run test/material-teardown.test.ts && npm run typecheck && npm run lint`

Expected: PASS。

**Step 5: Commit**

```bash
git add packages/domain/src/material-teardown.ts packages/domain/test/material-teardown.test.ts
git commit -m "feat: 解耦拆片语义段与精确时间段"
```

### Task 2: 拆片 Prompt v3 与 Agent 输出适配

**Files:**
- Create: `apps/worker/src/materials/prompts/teardown-v3.md`
- Modify: `apps/worker/src/materials/teardown-prompt.ts`
- Modify: `apps/worker/test/teardown-prompt.test.ts`
- Modify: `apps/worker/test/teardown-analyzer.test.ts`
- Modify: `apps/worker/test/material-teardown-handler.test.ts`

**Step 1: Write the failing tests**

- Prompt 版本必须为 `teardown-v3` 并通过固定模板 SHA。
- Prompt 明示“拆片不是裁 MP4”“whole_video 要输出多个 semanticSections”“不得输出 timed segments”。
- Agent 接受多段无时间语义结果，拒绝整段字幕下的 timed segments、错误 alignment status 和证据错配。
- 既有时间字幕仍能返回精确时间结构。

**Step 2: Run tests to verify RED**

Run: `npm test -- --run test/teardown-prompt.test.ts test/teardown-analyzer.test.ts test/material-teardown-handler.test.ts`

Expected: 旧 v2 Prompt 和旧输出 fixture 失败。

**Step 3: Implement prompt and fixtures**

- 从老板指定源 Prompt 的七模块目标中提炼：预检、全局结构、爆点、角色/要素、语义分段、逐句证据、复刻与互动逻辑。
- 不添加当前 Schema 无法承接的自由文本字段。
- 明确视觉 payload 尚未授权，不能声称看过帧内容。
- 更新全部内部 fixture；Prompt/Schema 版本变化使旧 analysis checkpoint 自动失效。

**Step 4: Run tests to verify GREEN**

Run: `npm test -- --run test/teardown-prompt.test.ts test/teardown-analyzer.test.ts test/material-teardown-handler.test.ts && npm run typecheck && npm run lint`

Expected: PASS。

**Step 5: Commit**

```bash
git add apps/worker/src/materials apps/worker/test/teardown-prompt.test.ts apps/worker/test/teardown-analyzer.test.ts apps/worker/test/material-teardown-handler.test.ts
git commit -m "feat: 用v3提示词输出无时间多段语义拆片"
```

### Task 3: 逐镜头分页帧墙

**Files:**
- Modify: `apps/worker/src/materials/film-analyzer.ts`
- Modify: `apps/worker/test/film-analyzer.test.ts`
- Modify: `apps/worker/test/film-analyzer.integration.test.ts`

**Step 1: Write the failing tests**

- 1–36 个镜头生成 1 页，37 个镜头生成 2 页。
- 每页记录真实的首尾镜头索引、帧数、状态和安全相对 `artifactRef`。
- ready 帧使用已有 JPEG，placeholder 使用 FFmpeg 本地灰色输入，槽位不减少。
- 某页 FFmpeg 失败时返回该页 `unavailable`，其他页保持 ready。
- 所有媒体进程继续使用参数数组、超时和输出预算。

**Step 2: Run tests to verify RED**

Run: `npm test -- --run test/film-analyzer.test.ts`

Expected: `contactSheets.shots` 不存在。

**Step 3: Implement shot contact sheets**

- 镜头代表帧完成后再按 36 个分组。
- 使用 FFmpeg 多输入 `xstack` 生成 6 列网格，不重新从视频解码 ready 帧。
- placeholder 使用 `lavfi color` 生成等尺寸灰块。
- 输出 `contact/contact-shots-0000.jpg` 等安全相对路径。
- 页面失败仅降级该页，不中止 film 分析。

**Step 4: Run unit and real FFmpeg tests**

Run: `npm test -- --run test/film-analyzer.test.ts test/film-analyzer.integration.test.ts && npm run typecheck && npm run lint`

Expected: PASS，真实生成的视频得到非空逐镜头帧墙文件。

**Step 5: Commit**

```bash
git add apps/worker/src/materials/film-analyzer.ts apps/worker/test/film-analyzer.test.ts apps/worker/test/film-analyzer.integration.test.ts
git commit -m "feat: 生成分页逐镜头帧墙"
```

### Task 4: 内部拆片结果承接与缓存兼容

**Files:**
- Modify: `apps/worker/src/materials/teardown-handler.ts`
- Modify: `apps/worker/test/material-teardown-handler.test.ts`

**Step 1: Write the failing tests**

- Handler completed 结果同时返回 `film/transcript/analysis`，未来页面无需从 Agent 文本反解析帧墙或文稿。
- 重试复用 film/transcript/analysis 时仍返回同一结构。
- B14 旧 analysis 缺新字段时不得复用，必须只重跑 Agent 分析。
- 返回值和 checkpoint 不包含签名 URL。

**Step 2: Run tests to verify RED**

Run: `npm test -- --run test/material-teardown-handler.test.ts`

Expected: Handler 尚未返回 film/transcript。

**Step 3: Implement the minimal result envelope**

- completed 结果加入只读 `film` 与 `transcript`。
- 不复制媒体文件内容或绝对路径，只返回已有安全 artifact refs 和结构化字幕。
- 保持 analysis fingerprint 和严格 parser 作为缓存门禁。

**Step 4: Run tests to verify GREEN**

Run: `npm test -- --run test/material-teardown-handler.test.ts && npm run typecheck && npm run lint`

Expected: PASS。

**Step 5: Commit**

```bash
git add apps/worker/src/materials/teardown-handler.ts apps/worker/test/material-teardown-handler.test.ts
git commit -m "feat: 返回可直接承接页面的拆片结构"
```

### Task 5: 全量质量、自审与 Claude 交接

**Files:**
- Create: `docs/plans/B15-状态.md`
- Create: `docs/evidence/B15-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: Run focused and full tests**

Run all package tests, typecheck, lint, audit, coverage, complexity, `git diff --check` and the opt-in Claude SDK smoke using the same commands recorded in B14 quality evidence.

Expected: all existing baselines remain green and new material modules meet at least 80% branch coverage.

**Step 2: Perform first-principles self-review**

Review data truth, time semantics, evidence integrity, artifact path safety, FFmpeg resource bounds, cache invalidation, credential leakage and untrusted Agent output. Fix all contract-independent findings before handoff.

**Step 3: Record truthful status**

Clearly separate implemented/tested from not merged/not deployed/not externally integrated. Record that no MP4 splitting, real IdeaLab transport, OS bridge, DB/API/Job/frontend or visual payload egress was added.

**Step 4: Write Claude review request**

Append one P-numbered entry to `docs/relay/inbox-arch.md` with commit chain, test evidence, exact review points and unresolved contract decisions.

**Step 5: Commit**

```bash
git add docs/plans/B15-状态.md docs/evidence/B15-代码质量报告.md docs/plans/Codex后端交付总账.md docs/plans/工作台账.md docs/relay/inbox-arch.md
git commit -m "docs: 交付B15拆片语义与帧墙审查材料"
```
