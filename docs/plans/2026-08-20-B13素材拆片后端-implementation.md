# B13 素材拆片后端 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 B12 安全素材来源之后实现可测试的下载、字幕/云 ASR 选择、FFmpeg 抽帧、结构化证据和 Agent SDK 拆片内核，且不引入本地 ASR。

**Architecture:** Worker 以确定性阶段编排媒体处理，平台字幕优先、云 ASR 通过端口兜底，FFmpeg 只消费受控临时文件，Agent 只消费版本化证据包并返回严格 JSON Schema。B13a 只交付内部模块与端口，不新增公开 API、数据库 migration、正式 job type 或生产 Runtime 注册。

**Tech Stack:** TypeScript 5.9、Node.js Fetch/Streams/child_process、Zod 4.1.5、Vitest 3.2、FFmpeg/FFprobe 8、Claude Agent SDK 0.3.235、现有 localhost 多模型网关。

---

## 执行原则

- 工作树：`/private/tmp/ka-be-b13`，分支 `be/b13`；
- 每个 Task 独立 TDD 和独立提交；
- ContentRadar `/Users/aik/Desktop/抖音的系统` 只读；
- 禁止增加 Whisper/faster-whisper/本地 ASR 依赖；
- 测试数据全部为程序生成假媒体和虚构字幕；
- 不修改 `packages/contract/**`、`packages/db/migrations/**`、生产 Runtime 注册和前端；
- 任何日志、错误、事件都不得含完整签名 URL、API Key 或业务标识。

### Task 1: 修复真实 CDN `application/octet-stream` 准入

**Files:**
- Modify: `apps/worker/src/sources/material-source-probe.ts`
- Modify: `apps/worker/test/material-source-probe.test.ts`

**Step 1: 写失败测试**

新增三组反例：

```ts
it("admits allowlisted octet-stream video only with mandatory container validation", async () => {
  // VIDEO candidate + allowlisted host + bounded length
  // expect requiresContainerValidation === true
});

it("still rejects octet-stream for non-video material", async () => {
  // IMAGE metadata must fail before network
});

it("does not treat arbitrary content types as opaque media", async () => {
  // application/zip remains blocked
});
```

**Step 2: 运行确认 RED**

Run: `npm test -- --run test/material-source-probe.test.ts`

Expected: octet-stream 用例失败，当前返回 `content_type_not_allowed`。

**Step 3: 最小实现**

扩展 `MaterialSourceProbeResult`，增加 `requiresContainerValidation: boolean`。仅 `video/*` 或 `application/octet-stream` 可通过；后者必须标记为需要 FFprobe。候选不是 VIDEO、host 未 allowlist、长度未知/超限时仍失败。

**Step 4: 运行门禁**

```bash
npm test -- --run test/material-source-probe.test.ts
npm run typecheck
npm run lint
```

**Step 5: 提交**

```bash
git add apps/worker/src/sources/material-source-probe.ts apps/worker/test/material-source-probe.test.ts
git commit -m "fix: 兼容受控素材CDN二进制类型"
```

### Task 2: 冻结字幕时间轴与来源选择领域规则

**Files:**
- Create: `packages/domain/src/material-transcript.ts`
- Create: `packages/domain/test/material-transcript.test.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: 写失败测试**

覆盖：

- 平台字幕合法时不调用云 ASR；
- 无平台字幕时只调用一次云 ASR；
- 平台字幕无效时允许转云 ASR并记录安全原因；
- 云 ASR 未配置返回 `blocked_transcript_provider`；
- 时间段排序、非重叠、`0 <= startMs < endMs <= durationMs`；
- 空文本、NaN、小数毫秒、危险对象、过多段/过长文本 fail-closed；
- source 只能是 `platform_caption|cloud_asr`，不存在 local ASR 枚举。

端口：

```ts
export interface CloudAsrPort {
  transcribe(input: {
    mediaContentSha256: string;
    mediaHandle: string;
    durationMs: number;
  }): Promise<unknown>;
}
```

**Step 2: 运行确认 RED**

Run: `npm test -- --run test/material-transcript.test.ts`

Expected: 模块不存在。

**Step 3: 实现**

实现 `parseTranscriptTimeline`、`resolveTranscriptTimeline`、`fingerprintTranscriptTimeline` 和稳定错误 `MaterialTranscriptError`；错误不得包含字幕原文。

**Step 4: 测试/typecheck/lint 后提交**

```bash
npm test -- --run test/material-transcript.test.ts
npm run typecheck
npm run lint
git add packages/domain/src/material-transcript.ts packages/domain/test/material-transcript.test.ts packages/domain/src/index.ts
git commit -m "feat: 建立素材字幕与云ASR选择规则"
```

### Task 3: 建立拆片证据包、输出 Schema 与稳定指纹

**Files:**
- Create: `packages/domain/src/material-teardown.ts`
- Create: `packages/domain/test/material-teardown.test.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: 写失败测试**

覆盖 Shot 连续有序、总时长边界、失败帧 placeholder 不移位、evidence ID 唯一、引用必须存在、资源上限、稳定 fingerprint，以及禁止 `gmv`、`conversionRate`、`completionRate` 等无输入后台指标。

**Step 2: 运行确认 RED**

Run: `npm test -- --run test/material-teardown.test.ts`

**Step 3: 实现**

实现：

- `createMaterialTeardownEvidence`
- `parseMaterialTeardownResult`
- `materialTeardownJsonSchema`
- `fingerprintMaterialTeardownAnalysis`
- `MaterialTeardownError`

返回值结构化克隆并冻结，不保留调用方可变引用。

**Step 4: 测试/typecheck/lint 后提交**

```bash
npm test -- --run test/material-teardown.test.ts
npm run typecheck
npm run lint
git add packages/domain/src/material-teardown.ts packages/domain/test/material-teardown.test.ts packages/domain/src/index.ts
git commit -m "feat: 建立素材拆片证据与输出契约"
```

### Task 4: 实现安全媒体下载与临时文件生命周期

**Files:**
- Create: `apps/worker/src/materials/download-service.ts`
- Create: `apps/worker/src/materials/index.ts`
- Create: `apps/worker/test/material-download-service.test.ts`

**Step 1: 写失败测试**

用 fake Fetch + 测试临时目录覆盖逐跳 allowlist、流式超限、长度漂移、partial 清理、随机任务目录、SHA-256、URL 脱敏、release 幂等；octet-stream 必须将 FFprobe 验证要求传给下游。

**Step 2: 运行确认 RED**

Run: `npm test -- --run test/material-download-service.test.ts`

**Step 3: 实现**

使用 `mkdtemp`、Web Stream reader 和受控文件句柄；下载时重新执行来源门禁，不把 URL basename 用作文件名。

输出：

```ts
interface DownloadedMaterialHandle {
  path: string;
  contentSha256: string;
  byteLength: number;
  contentType: string;
  requiresContainerValidation: boolean;
  release(): Promise<void>;
}
```

**Step 4: 测试/typecheck/lint 后提交**

```bash
npm test -- --run test/material-download-service.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials apps/worker/test/material-download-service.test.ts
git commit -m "feat: 实现素材安全下载与临时清理"
```

### Task 5: 复用 ContentRadar 方法实现 FFmpeg 抽帧

**Files:**
- Create: `apps/worker/src/materials/media-process-runner.ts`
- Create: `apps/worker/src/materials/film-analyzer.ts`
- Create: `apps/worker/test/film-analyzer.test.ts`
- Create: `apps/worker/test/film-analyzer.integration.test.ts`
- Modify: `apps/worker/src/materials/index.ts`

**Step 1: 写失败单测**

注入 fake process runner，覆盖固定 ffmpeg/ffprobe、`shell:false`、路径限制、无视频流、非法 duration、scene 0.15/hard cut 0.30、Shot 中点、500 cut 上限、Hook 15 帧、全片 36 帧、逐 Shot 216 帧上限、失败帧 placeholder、超时终止和 stderr 截断。

**Step 2: 运行确认 RED**

Run: `npm test -- --run test/film-analyzer.test.ts`

**Step 3: 实现**

从 ContentRadar `film_features.py` 复用算法和阈值，但用 TypeScript 独立实现。所有命令使用参数数组，输出只保存相对 artifact ref。

**Step 4: 真实 FFmpeg 假视频烟测**

测试用 FFmpeg 生成三段纯色拼接的 3 秒 MP4，运行真实 analyzer，验证 duration、视觉变化、Shot/frame 对齐、contact sheet 和清理。

Run: `npm test -- --run test/film-analyzer.integration.test.ts`

**Step 5: 回归并提交**

```bash
npm test -- --run test/film-analyzer.test.ts test/film-analyzer.integration.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials apps/worker/test/film-analyzer.test.ts apps/worker/test/film-analyzer.integration.test.ts
git commit -m "feat: 复用内容雷达方法实现FFmpeg抽帧"
```

### Task 6: 版本化 Prompt 与结构化模型分析

**Files:**
- Create: `apps/worker/src/materials/prompts/teardown-v1.md`
- Create: `apps/worker/src/materials/teardown-prompt.ts`
- Create: `apps/worker/src/materials/teardown-analyzer.ts`
- Create: `apps/worker/test/teardown-prompt.test.ts`
- Create: `apps/worker/test/teardown-analyzer.test.ts`
- Modify: `apps/worker/src/materials/index.ts`

**Step 1: 快照 Prompt**

从用户指定本地 Prompt 复制规则到 KA Prompt Registry；保留总时长锁定、逐句证据、镜头与台词分离、A/B-roll、Hook、结构、复刻和禁止臆造后台指标。文件头记录来源、版本、日期和 SHA；运行时不得访问 Obsidian。

**Step 2: 写失败测试**

覆盖 Prompt 固定版本/SHA、稳定渲染、长度预算、签名 URL/凭证拒绝、必须携带 JSON Schema、structured output 二次验证、自由文本/未知字段/非法证据引用失败，Provider/model/version 进入分析 fingerprint。

端口：

```ts
interface StructuredTeardownAgentPort {
  execute(input: {
    prompt: string;
    systemPrompt: string;
    outputJsonSchema: Record<string, unknown>;
  }): Promise<{
    structuredOutput: unknown;
    providerId: string;
    model: string;
    profileVersion: string;
  }>;
}
```

**Step 3: 运行确认 RED**

Run: `npm test -- --run test/teardown-prompt.test.ts test/teardown-analyzer.test.ts`

**Step 4: 实现并复用 B5**

`TeardownAnalyzer` 只依赖结构化 Agent 端口。Runtime 适配复用 B5 `ClaudeAgentRuntime` 的 `outputJsonSchema`、Provider binding 和 localhost gateway；built-in tools 保持禁用。默认测试使用 fake QueryFactory，真实云模型调用保持 opt-in。

**Step 5: 测试/typecheck/lint 后提交**

```bash
npm test -- --run test/teardown-prompt.test.ts test/teardown-analyzer.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials apps/worker/test/teardown-prompt.test.ts apps/worker/test/teardown-analyzer.test.ts
git commit -m "feat: 接入版本化拆片Prompt与结构化Agent"
```

### Task 7: 编排阶段、幂等指纹和安全失败

**Files:**
- Create: `apps/worker/src/materials/teardown-handler.ts`
- Create: `apps/worker/test/material-teardown-handler.test.ts`
- Modify: `apps/worker/src/materials/index.ts`

**Step 1: 写失败测试**

覆盖 download → transcript/visual 并行 → evidence → analysis；平台字幕不调 ASR；无字幕只调一次；失败总会 release；已有 checkpoint 不重复 ASR/FFmpeg；同 fingerprint 复用；Prompt/Provider 版本变化触发新分析；错误不含 URL/字幕全文/凭证；blocked provider、FFmpeg timeout、invalid output 不冒充成功。

**Step 2: 运行确认 RED**

Run: `npm test -- --run test/material-teardown-handler.test.ts`

**Step 3: 实现内部 Handler**

定义 `TeardownCheckpointPort`、`MaterialDownloaderPort`、`TranscriptResolverPort`、`FilmAnalyzerPort`、`TeardownAnalyzerPort`。不注册正式 job type；先用内存 fake 证明幂等语义，DB 等契约裁决。

**Step 4: 回归并提交**

```bash
npm test -- --run test/material-teardown-handler.test.ts
npm test -- --run test/material-*.test.ts test/film-analyzer*.test.ts test/teardown-*.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials apps/worker/test/material-teardown-handler.test.ts
git commit -m "feat: 编排可恢复素材拆片流水线"
```

### Task 8: 全量质量门禁、状态和审查回执

**Files:**
- Create: `docs/plans/B13-状态.md`
- Create: `docs/evidence/B13-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: 四包全量门禁**

```bash
cd packages/domain && npm test -- --run && npm run typecheck && npm run lint && npm audit
cd ../db && npm test -- --run && npm run typecheck && npm run lint && npm audit
cd ../../apps/worker && npm test -- --run && npm run typecheck && npm run lint && npm audit
cd ../dingtalk-gateway && npm test -- --run && npm run typecheck && npm run lint && npm audit
```

真实 FFmpeg 假视频烟测不可跳过。

**Step 2: 覆盖率与安全扫描**

- B13 新模块 line/branch/function ≥80%；
- 搜索本地 ASR 依赖、动态 shell、签名 URL/凭证写日志、危险路径；
- `git diff be/b12 -- packages/contract packages/db/migrations apps/worker/src/runtime.ts` 必须为空；
- `git diff --check` 通过。

**Step 3: 多维自审**

检查 50 万素材库是否被误做全量下载、octet-stream 是否过度放宽、平台字幕失败是否错误降级本地 ASR、临时文件/子进程/AbortController 泄漏、Prompt 是否编造证据外指标、Provider fallback 后幂等与成本版本。

**Step 4: 写 P-020 回执**

明确区分代码完成、合入 main、真实云 ASR 联调、真实素材 E2E、部署/上线。未完成项至少包括公开 API/DB/job、真实 Provider、真实 FaaS CDN、OS 第五轮商品/承接页/字幕、前端、相似检索和复刻。

**Step 5: 提交**

```bash
git add docs/plans/B13-状态.md docs/evidence/B13-代码质量报告.md docs/plans/Codex后端交付总账.md docs/plans/工作台账.md docs/relay/inbox-arch.md
git commit -m "docs: 交付B13素材拆片内核审查材料"
git show --stat HEAD
```

## 执行方式

老板已明确“备份完成后继续工程”，因此本轮默认在当前会话顺序执行，不再等待选择；受多 Agent 限制不派子 Agent。每个 Task 完成后本地验证并提交，最终统一交 Claude/arch 审查。

