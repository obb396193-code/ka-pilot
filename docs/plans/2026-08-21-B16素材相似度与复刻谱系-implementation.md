# B16 素材相似度与复刻谱系 Implementation Plan

> 日期：2026-08-21
> 设计：`docs/plans/2026-08-21-B16素材相似度与复刻谱系-design.md`
> 工作树：`/private/tmp/ka-be-b14`
> 分支：`codex/b15-material-teardown-semantics`

**Goal:** 在不修改公开 Contract、数据库、Runtime 和前端的前提下，交付确定性、可解释、版本化的素材相似度画像/评分，以及独立的不可变复刻谱系领域对象。

**Architecture:** 新增单一纯 Domain 模块 `material-similarity.ts`，只接收 B15 已校验的 `MaterialTeardownResult` 与 `MaterialTeardownVisualSummary`。模块内部完成有限规范化、稳定指纹、分项评分和谱系校验；不做 IO、模型调用或持久化。

**Tech Stack:** TypeScript 5.9、Zod 4、Vitest、Node crypto；沿用 `@ka/domain` 的严格 ESM、exact optional types 和深冻结约束。

---

## Task 1：画像与稳定指纹

**Files:**
- Create: `packages/domain/src/material-similarity.ts`
- Create: `packages/domain/test/material-similarity.test.ts`
- Modify: `packages/domain/src/index.ts`

1. 写 RED tests：合法 B15 结果生成画像；对象键顺序不影响指纹；语义段顺序和视觉值变化会改变指纹；非法标识/SHA/版本/超预算输入 fail-closed。
2. 执行单文件测试确认因缺实现失败。
3. 实现严格输入 Schema、中文/英文字符 n-gram、去重排序、视觉归一字段、canonical JSON 与 SHA-256。
4. 深冻结画像；补导出。
5. 运行单文件 tests、typecheck、lint。

## Task 2：可解释相似度评分

**Files:**
- Modify: `packages/domain/src/material-similarity.ts`
- Modify: `packages/domain/test/material-similarity.test.ts`

1. 写 RED tests：相同画像满分；部分文本重叠分数单调；结构顺序变化被识别；缺项重新归一；证据不足返回无总分；结果对输入顺序稳定。
2. 实现六组件 scorer：结构/钩子/卖点/人群/节奏/CTA。
3. 每组件输出 `status/score/baseWeight/reasonCode`；总分只在 ≥3 组件且 base weight ≥0.50 时生成。
4. 所有小数统一四位，输入画像版本不一致时 fail-closed，结果带稳定 fingerprint。
5. 运行定向 tests、typecheck、lint。

## Task 3：复刻谱系领域对象

**Files:**
- Modify: `packages/domain/src/material-similarity.ts`
- Modify: `packages/domain/test/material-similarity.test.ts`

1. 写 RED tests：合法边稳定生成；源/派生自环、非法 SHA、非法 ID、未来时间、超长备注拒绝；字段键序不影响 fingerprint；结果深冻结。
2. 实现 `createMaterialReplicationLineage`，只接收严格白名单字段和四种 method。
3. 日期规范为 ISO，禁止超过调用方提供的 `observedAt`；错误只返回稳定码。
4. 运行定向 tests、typecheck、lint。

## Task 4：全量质量、自审与交接

**Files:**
- Create: `docs/plans/B16-状态.md`
- Create: `docs/evidence/B16-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

1. 跑 Domain 全量 tests + coverage、typecheck、lint。
2. 用 code-quality-checker 逐项审输入验证、资源上限、指纹稳定、浮点边界、中文 token、深冻结、复杂度与错误脱敏。
3. 修复发现的问题并重复门禁。
4. 确认 `packages/contract`、`packages/db/migrations`、`apps/worker/src/runtime.ts`、`apps/web` 相对 B15 无变化。
5. 写状态、质量报告、总账和 arch 信箱；明确未合并、未部署、无 API/DB/前端。
6. 提交代码与交接版本，`git show --stat HEAD` 自查。
