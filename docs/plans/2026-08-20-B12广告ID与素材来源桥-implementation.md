# B12 广告 ID 与素材来源桥实施计划

**Goal:** 在 `be/b11` 干净终态上实现合同中立的广告 ID 证据门、奇航素材池分页客户端和视频来源安全探针。

**Architecture:** Worker 内部采用 ports + strict adapters。广告对象候选必须通过显式证据门后才能成为 `adIds`；素材池使用独立只读 HTTP client，分页完整性和资源预算 fail-closed；视频 URL 使用部署级 host allowlist 和手动跳转探针，不下载正文。

**Tech Stack:** TypeScript、Vitest、Zod、原生 Fetch API。

---

### Task 1: 固化设计、OS 探针和状态

**Files:**
- Create: `docs/plans/2026-08-20-B12广告ID与素材来源桥-design.md`
- Create: `docs/plans/B12-OS第四轮只读探针.md`
- Create: `docs/plans/B12-状态.md`
- Modify: `docs/plans/工作台账.md`

记录已确认与未确认边界，不把 CLI 源码意图冒充真实接口兼容。

### Task 2: 广告 ID 证据门

**Files:**
- Create: `apps/worker/src/sources/ad-identifiers.ts`
- Create: `apps/worker/test/ad-identifiers.test.ts`

先写反例：未确认映射、不完整、冲突/空白/重复标识；再实现归一化、指纹和 `requireAuthoritativeAdIds`。

### Task 3: 素材池严格分页客户端

**Files:**
- Create: `apps/worker/src/sources/material-pool-client.ts`
- Create: `apps/worker/src/sources/material-schemas.ts`
- Create: `apps/worker/test/material-pool-client.test.ts`

先写分页/Schema/资源预算 RED；实现明确 query、业务 envelope 校验、total 稳定、终止条件、去重冲突和安全观测。

### Task 4: 视频来源准入与最小探针

**Files:**
- Create: `apps/worker/src/sources/material-source-probe.ts`
- Create: `apps/worker/test/material-source-probe.test.ts`

先写默认拒绝、host allowlist、跳转逃逸、非视频、未知/超大长度反例；实现 HEAD 优先、必要时 Range fallback 的只读探针，不读取视频正文。

### Task 5: 导出、配置样例与全量质量

**Files:**
- Create: `apps/worker/src/sources/index.ts`
- Modify: `apps/worker/.env.example`
- Modify: `docs/plans/B12-状态.md`
- Modify: `docs/evidence/B12-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/relay/inbox-arch.md`
- Modify: `docs/plans/工作台账.md`

运行定向和全量 test、typecheck、lint、audit、coverage、复杂度与敏感扫描。记录“代码完成/已提交/待审/未部署/未真实联调”的独立状态。
