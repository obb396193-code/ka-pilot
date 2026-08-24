# B14 整段 ASR 与临时 URL 租约 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让一条素材只调用一次无时间戳云 ASR 并诚实降级为整段诊断，同时确保每次执行都重新获取临时签名 URL 后立即下载。

**Architecture:** Domain 显式携带 `segment|whole_video` 字幕精度，精度进入指纹与拆片证据；整段文本只能生成全片级结构，不允许冒充逐秒字幕。Worker 用可注入的整段 ASR transport 适配严格 `{text}` 输出，并把稳定素材引用→OS URL 获取→即时下载封装成单次租约；不实现未知的 IdeaLab/OS HTTP 协议。

**Tech Stack:** TypeScript 5.9、Node.js、Zod 4.1.5、Vitest 3.2、现有 Claude Agent SDK/localhost gateway 与 B13 素材模块。

---

## 执行原则

- 工作树 `/private/tmp/ka-be-b14`，分支 `be/b14`；
- TDD：每个 Task 先写反例、确认 RED、最小实现、回归、独立提交；
- 不修改 `packages/contract/**`、`packages/db/migrations/**`、`apps/worker/src/runtime.ts` 和前端；
- 不新增 Whisper/faster-whisper、本地 ASR 或多段切片调用；
- 不猜 IdeaLab multipart URL、OS Source Bridge HTTP/CLI 回执或稳定素材主键；
- 完整签名 URL 不进入错误、checkpoint、Prompt 或证据。

### Task 1: 字幕时间精度与单次整段云输出

**Files:**
- Modify: `packages/domain/src/material-transcript.ts`
- Modify: `packages/domain/test/material-transcript.test.ts`

**Step 1: 写失败测试**

覆盖：

- Cloud ASR 返回 `{kind:"whole_text",text:"..."}` 时只调用一次；
- 规范化为唯一 `0..durationMs` segment，`timingPrecision="whole_video"`；
- 现有数组时间轴保持 `timingPrecision="segment"`；
- precision 进入 fingerprint，同文本/同边界但精度不同的 fingerprint 不同；
- whole_text 只允许严格对象与非空有界文本，未知字段/getter/超长文本失败且错误不回显原文。

**Step 2: 运行确认 RED**

```bash
cd packages/domain
npm test -- --run test/material-transcript.test.ts
```

Expected: `timingPrecision` 与 whole_text 输出尚未实现。

**Step 3: 最小实现**

增加：

```ts
export type TranscriptTimingPrecision = "segment" | "whole_video";

export interface CloudAsrWholeTextOutput {
  readonly kind: "whole_text";
  readonly text: string;
}
```

`TranscriptTimeline`、`TranscriptResolution` 和 `TranscriptSegment` 均携带精度；`parseTranscriptTimeline` 的显式 timeline 默认使用 `segment`，整段输出由独立安全解析器构造。hash 输入必须包含 timeline 与 segment precision。

**Step 4: 运行门禁**

```bash
npm test -- --run test/material-transcript.test.ts
npm run typecheck
npm run lint
```

**Step 5: 提交**

```bash
git add packages/domain/src/material-transcript.ts packages/domain/test/material-transcript.test.ts
git commit -m "feat: 支持无时间戳整段云转写"
```

### Task 2: 拆片证据与结果按精度降级

**Files:**
- Modify: `packages/domain/src/material-teardown.ts`
- Modify: `packages/domain/test/material-teardown.test.ts`

**Step 1: 写失败测试**

- `timingPrecision` 进入 transcript evidence 与 evidence fingerprint；
- `whole_video` 证据只能对应一个 `0..durationMs` 的结果 segment；
- whole_video 下输出多个精确 segment 必须 `invalid_result`；
- segment 精度继续支持原来的完整多段闭环；
- checkpoint 反序列化/重新建证据不能丢 precision。

**Step 2: 运行 RED**

```bash
npm test -- --run test/material-teardown.test.ts
```

**Step 3: 实现**

- `MaterialTranscriptEvidence` 增加 `timingPrecision`；
- `createMaterialTeardownEvidence` 重建 timeline 时显式保留精度；
- canonical fingerprint 序列化 precision；
- `parseMaterialTeardownResult` 在 whole_video 下要求结果仅一个全片 segment，阻止伪秒级拆解。

**Step 4: 回归并提交**

```bash
npm test -- --run test/material-transcript.test.ts test/material-teardown.test.ts
npm run typecheck
npm run lint
git add packages/domain/src/material-teardown.ts packages/domain/test/material-teardown.test.ts
git commit -m "feat: 按字幕精度约束拆片证据"
```

### Task 3: Prompt v2 明示整段诊断边界

**Files:**
- Create: `apps/worker/src/materials/prompts/teardown-v2.md`
- Modify: `apps/worker/src/materials/teardown-prompt.ts`
- Modify: `apps/worker/test/teardown-prompt.test.ts`
- Modify: `apps/worker/test/teardown-analyzer.test.ts`
- Modify: `apps/worker/test/material-teardown-handler.test.ts`

**Step 1: 写失败测试**

- Prompt 版本升级为 `teardown-v2`，固定模板 SHA；
- whole_video 输入必须出现“无句级时间戳/不得精确归因到镜头”的明确约束；
- Prompt 漂移继续 fail-closed；
- Analyzer 对 whole_video 合法单段输出通过，多段精确输出失败。

**Step 2: 确认 RED**

```bash
cd apps/worker
npm test -- --run test/teardown-prompt.test.ts test/teardown-analyzer.test.ts test/material-teardown-handler.test.ts
```

**Step 3: 实现**

从 v1 复制生成 v2，只新增字幕精度纪律：

- `segment` 可按已有时间证据分析；
- `whole_video` 仅全文语义诊断，不能把台词放入具体秒点；
- 结果 `segments` 必须单段覆盖全片；
- `uncertainties` 明示无句级时间戳。

计算并固定 v2 SHA；运行时只读 v2，不改写 v1 历史快照。

**Step 4: 回归并提交**

```bash
npm test -- --run test/teardown-prompt.test.ts test/teardown-analyzer.test.ts test/material-teardown-handler.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials/prompts/teardown-v2.md apps/worker/src/materials/teardown-prompt.ts apps/worker/test
git commit -m "feat: 升级整段诊断拆片Prompt"
```

### Task 4: 一次调用的整段云 ASR 适配器

**Files:**
- Create: `apps/worker/src/materials/whole-text-cloud-asr.ts`
- Create: `apps/worker/test/whole-text-cloud-asr.test.ts`
- Modify: `apps/worker/src/materials/index.ts`

**Step 1: 写失败测试**

注入 transport，覆盖：

- 一条视频只调用 transport 一次；
- 输入只含受控本地 media handle、内容 SHA、时长和固定 provider/model profile；
- 只接受严格 `{text}` 响应并返回 `{kind:"whole_text",text}`；
- transport 错误、空/超长/未知字段/getter 响应映射为稳定无明细错误；
- 错误与返回元数据不含文件路径、AK 或原始响应。

**Step 2: 确认 RED**

```bash
npm test -- --run test/whole-text-cloud-asr.test.ts
```

**Step 3: 实现**

定义 `WholeTextAsrTransport` 和 `WholeTextCloudAsrAdapter`。本批 transport 由部署适配器注入，不写 IdeaLab endpoint、Authorization 或 multipart 字段；固定一次调用、输出预算和安全错误。

**Step 4: 回归并提交**

```bash
npm test -- --run test/whole-text-cloud-asr.test.ts test/material-teardown-handler.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials/whole-text-cloud-asr.ts apps/worker/src/materials/index.ts apps/worker/test/whole-text-cloud-asr.test.ts
git commit -m "feat: 增加单次整段云ASR适配器"
```

### Task 5: 临时素材 URL 即取即下租约

**Files:**
- Modify: `apps/worker/src/materials/teardown-handler.ts`
- Modify: `apps/worker/test/material-teardown-handler.test.ts`

**Step 1: 写失败测试**

- Handler 输入稳定 opaque `sourceRef`，不输入 URL；
- 每次 handle 都先 `MaterialUrlLeasePort.acquire`，再立即 download；
- 两次执行即使内容 SHA 相同也重新 acquire，允许 URL 不同并复用后续 checkpoint；
- acquire/download 失败不保存 URL，错误不回显 URL；
- checkpoint 类型中不能出现 candidate/materialUrl；
- release 与 B13 保证不变。

**Step 2: 确认 RED**

```bash
npm test -- --run test/material-teardown-handler.test.ts
```

**Step 3: 实现**

增加：

```ts
export interface MaterialUrlLeasePort {
  acquire(sourceRef: string): Promise<MaterialSourceCandidate>;
}
```

`handle` 内部顺序固定 acquire→download；`sourceRef` 只做有界 opaque 校验。OS 具体调用由未来 adapter 实现，当前不发明协议。

**Step 4: 回归并提交**

```bash
npm test -- --run test/material-teardown-handler.test.ts test/material-download-service.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials/teardown-handler.ts apps/worker/test/material-teardown-handler.test.ts
git commit -m "feat: 素材临时URL改为即取即下"
```

### Task 6: 全量质量、状态与 P-021

**Files:**
- Create: `docs/plans/B14-状态.md`
- Create: `docs/evidence/B14-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: 全量门禁**

```bash
cd packages/domain && npm test -- --run && npm run typecheck && npm run lint && npm audit --audit-level=high
cd ../db && npm test -- --run && npm run typecheck && npm run lint && npm audit --audit-level=high
cd ../../apps/worker && npm test -- --run && npm run typecheck && npm run lint && npm audit --audit-level=high
cd ../dingtalk-gateway && npm test -- --run && npm run typecheck && npm run lint && npm audit --audit-level=high
```

单独执行真实 SDK opt-in、真实 FFmpeg 假视频和 PostgreSQL/migration 门禁。

**Step 2: 覆盖率与安全扫描**

- B14 新增/修改生产模块 line/branch/function ≥80%；
- 无本地 ASR、多次切片循环、动态 shell、URL/凭证持久化；
- `git diff be/b13 -- packages/contract packages/db/migrations apps/worker/src/runtime.ts apps/web` 为空；
- `git diff --check` 通过。

**Step 3: 状态与审查**

P-021 必须明确：

- 代码完成不等于真实 IdeaLab 文件调用；
- `whole_video` 是整体诊断，不是时间戳字幕；
- URL lease port 不等于 OS Source Bridge 协议已联通；
- 商品池发现、商品主数据、承接页端上验证仍未完成。

**Step 4: 提交**

```bash
git add docs/plans/B14-状态.md docs/evidence/B14-代码质量报告.md docs/plans/Codex后端交付总账.md docs/plans/工作台账.md docs/relay/inbox-arch.md
git commit -m "docs: 交付B14整段ASR与URL租约审查材料"
```

## 执行方式

老板已经选择单次整段诊断并要求继续工程。本轮在独立 worktree 顺序执行，不派子 Agent；每个 Task 完成后本地验证并提交，最终统一交 Claude/arch 审查。

