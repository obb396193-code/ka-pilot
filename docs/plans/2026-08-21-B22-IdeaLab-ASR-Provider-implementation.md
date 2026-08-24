# B22 IdeaLab ASR Provider Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把已真实验证的 IdeaLab `whisper` 通路实现为安全、可测试、默认关闭的 Worker 内部 ASR Provider。

**Architecture:** 新增 FFmpeg WAV 提取器和 IdeaLab multipart Transport，并由工厂组装现有 `WholeTextCloudAsrAdapter`。Transport 负责临时音频、HTTP、响应/usage 解析和错误分类；Domain 继续只接收 `whole_text`，不引入伪时间戳。生产拆片 Job/API 未冻结，本批只交付内部模块、配置与 opt-in 烟测。

**Tech Stack:** TypeScript 5.9、Node.js Fetch/FormData/AbortController/fs、现有 `MediaProcessRunner`、Zod 4.1.5、Vitest 3.2、FFmpeg 7/8。

---

## 执行原则

- 工作树：`/private/tmp/ka-be-b22`；分支：`codex/b22-idealab-asr-provider`。
- 严格 TDD；每个 Task 先 RED、再最小实现、再提交。
- 不新增第三方运行依赖，不做本地 ASR。
- 不修改 `packages/contract/**`、`packages/db/migrations/**`、前端或生产任务注册。
- 默认测试不得访问 IdeaLab 或消耗额度。
- 错误、观测和测试输出不得含 API Key、完整媒体路径、转写正文或 Provider response body。

### Task 1：冻结 ASR 配置和默认关闭语义

**Files:**
- Modify: `apps/worker/src/config.ts`
- Modify: `apps/worker/test/config.test.ts`

**Step 1: 写失败测试**

覆盖：默认 `idealabAsr=null`；启用时必须有 `IDEALAB_AK`；固定 HTTPS endpoint；正整数 WAV/响应预算；min/max timeout 有序；倍率有限；禁用时忽略 AK 且不把 Secret 放进序列化日志夹具。

**Step 2: 运行 RED**

Run: `npm test -- --run test/config.test.ts`（cwd `apps/worker`）  
Expected: 新配置断言失败。

**Step 3: 最小实现**

新增：

```ts
interface IdeaLabAsrConfig {
  endpoint: string;
  apiKey: string;
  maxWavBytes: number;
  maxResponseBytes: number;
  minTimeoutMs: number;
  maxTimeoutMs: number;
  timeoutMultiplier: number;
}
```

环境变量使用 `IDEALAB_ASR_ENABLED`、`IDEALAB_AK`、`IDEALAB_ASR_ENDPOINT`、`IDEALAB_ASR_MAX_WAV_BYTES`、`IDEALAB_ASR_MAX_RESPONSE_BYTES`、`IDEALAB_ASR_MIN_TIMEOUT_MS`、`IDEALAB_ASR_MAX_TIMEOUT_MS`、`IDEALAB_ASR_TIMEOUT_MULTIPLIER`。

**Step 4: 验证并提交**

```bash
npm test -- --run test/config.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/config.ts apps/worker/test/config.test.ts
git commit -m "feat: 增加IdeaLab ASR安全配置"
```

### Task 2：实现受控 WAV 提取与清理

**Files:**
- Create: `apps/worker/src/materials/wav-audio-extractor.ts`
- Create: `apps/worker/test/wav-audio-extractor.test.ts`
- Create: `apps/worker/test/wav-audio-extractor.integration.test.ts`
- Modify: `apps/worker/src/materials/index.ts`

**Step 1: 写失败测试**

使用 fake `MediaProcessRunner` 覆盖：固定 `-vn -ar 16000 -ac 1 -c:a pcm_s16le`；输出目录由 `mkdtemp` 创建；超时/非零退出/输出截断失败；空文件、符号链接、目录、超预算失败；成功句柄 byteLength 正确；release 幂等且只删 ASR 临时目录。

**Step 2: 运行 RED**

Run: `npm test -- --run test/wav-audio-extractor.test.ts`  
Expected: 模块不存在。

**Step 3: 最小实现**

实现 `FfmpegWavAudioExtractor` 和 `ExtractedWavHandle`。输入路径只作为 `spawn(shell:false)` 参数；错误只返回稳定 reason，不携带 stderr/path。

**Step 4: 真实 FFmpeg 集成测试**

程序生成一段带正弦音频的短 MP4，提取 WAV 后用 FFprobe/文件头确认单声道、16kHz、PCM；无 FFmpeg 环境时 `runIf` 跳过。

**Step 5: 验证并提交**

```bash
npm test -- --run test/wav-audio-extractor.test.ts test/wav-audio-extractor.integration.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials apps/worker/test/wav-audio-extractor*.test.ts
git commit -m "feat: 实现ASR受控WAV提取"
```

### Task 3：实现 IdeaLab multipart Transport

**Files:**
- Create: `apps/worker/src/materials/idealab-asr-transport.ts`
- Create: `apps/worker/test/idealab-asr-transport.test.ts`
- Modify: `apps/worker/src/materials/index.ts`

**Step 1: 写失败测试**

fake Fetch + fake Extractor 覆盖：

- endpoint、Bearer、`model=whisper`、`response_format=json`、WAV 文件字段正确；
- timeout=`min(maxTimeout,max(minTimeout,duration×multiplier))`；
- HTTP 400/401/403/429/5xx/网络/超时分类；
- redirect、响应超预算、非法 JSON、未知字段、非法 text/usage fail-closed；
- 真实 `{text,usage}` 归一为 `{text}`；观测仅含数字和枚举，不含正文、AK、路径；
- 任意结果都调用 WAV release，清理失败不覆盖更早的主错误；
- Transport 内部不重试。

**Step 2: 运行 RED**

Run: `npm test -- --run test/idealab-asr-transport.test.ts`。

**Step 3: 最小实现**

实现稳定错误：`invalid_config|invalid_input|auth_failed|invalid_request|rate_limited|retryable_transport|invalid_response|cleanup_failed`。响应使用有上限的 stream reader，不直接无界 `response.json()`。

**Step 4: 验证并提交**

```bash
npm test -- --run test/idealab-asr-transport.test.ts test/whole-text-cloud-asr.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials apps/worker/test/idealab-asr-transport.test.ts
git commit -m "feat: 实现IdeaLab ASR传输适配"
```

### Task 4：组装 Adapter 与 opt-in 真实烟测

**Files:**
- Create: `apps/worker/src/materials/idealab-asr-factory.ts`
- Create: `apps/worker/test/idealab-asr-factory.test.ts`
- Create: `apps/worker/test/idealab-asr.integration.test.ts`
- Modify: `apps/worker/src/materials/index.ts`

**Step 1: 写失败测试**

工厂必须把 `providerId=idealab-audio`、`model=whisper` 和稳定 profile hash 交给现有 Adapter；短文本仍返回 `whole_text`，不得因字符数少而失败；usage 不进入 Domain 输出。

**Step 2: 实现工厂**

接收已校验配置和可替换 `fetch/runner/observer`，返回 `CloudAsrPort`。不注册到生产 Runtime。

**Step 3: opt-in 烟测**

只有 `IDEALAB_ASR_SMOKE=true`、`IDEALAB_AK`、`IDEALAB_ASR_SMOKE_MEDIA_PATH` 同时存在才运行一次；断言非空 whole-text，不输出正文/usage/路径。

**Step 4: 验证并提交**

```bash
npm test -- --run test/idealab-asr-factory.test.ts test/idealab-asr.integration.test.ts
npm run typecheck
npm run lint
git add apps/worker/src/materials apps/worker/test/idealab-asr*.test.ts
git commit -m "feat: 组装IdeaLab whole-video ASR"
```

### Task 5：全量质量、自审与 Claude 交接

**Files:**
- Create: `docs/plans/B22-状态.md`
- Create: `docs/evidence/B22-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: 运行门禁**

- 四包全部默认 tests、typecheck、lint、audit；
- Worker 新模块 coverage ≥80%，核心错误分支重点检查；
- 真实 FFmpeg、现有 gateway、PG/migration 回归；
- 检查复杂度≤10、函数≤100 行、无 Secret/URL/路径泄漏；
- 默认测试确认没有 IdeaLab 网络调用。

**Step 2: 多维自审**

按第一性原理、安全、可靠性、资源生命周期、可观测、契约边界和测试反例逐项审查；发现问题先补反例再修。

**Step 3: 交接**

写 P-029，明确本批是内部 Provider 底座，尚未接生产 Job/API/部署，Claude/arch 需要审配置、错误分类和 Runtime 接入边界。

**Step 4: 提交**

```bash
git add docs
git commit -m "文档：交接B22 IdeaLab ASR Provider"
git show --stat HEAD
```

