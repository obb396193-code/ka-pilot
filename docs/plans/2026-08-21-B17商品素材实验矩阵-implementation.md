# B17 商品×素材实验矩阵 Implementation Plan

> 日期：2026-08-21
> 设计：`docs/plans/2026-08-21-B17商品素材实验矩阵-design.md`
> 工作树：`/private/tmp/ka-be-b14`

**Goal:** 交付可配置样本门、Wilson 95% 区间、CPA 效果门和保守观察分离的纯 Domain 商品×素材矩阵。

**Architecture:** 新增 `material-experiment.ts`。输入先做严格 Schema、幂等事实去重和资源预算，再按 product/material 汇总。比率统一从聚合分子/分母计算；商品结论只消费样本合格格子。全流程无 IO、无 Agent、无默认业务阈值。

**Tech Stack:** TypeScript 5.9、Zod 4、Vitest、Node crypto。

---

## Task 1：策略、事实与格子汇总

**Files:**
- Create: `packages/domain/src/material-experiment.ts`
- Create: `packages/domain/test/material-experiment.test.ts`
- Modify: `packages/domain/src/index.ts`

1. 写 RED tests：策略严格校验/稳定 fingerprint；事实跨字段校验；同 ID 相同内容去重、冲突失败；输入乱序结果稳定。
2. 实现最多 10,000 事实、1,000 格子的预算和 canonical fingerprint。
3. 按 product/material 聚合账户、日期、曝光、点击、真实转化、消耗。
4. CTR/CVR/CPA 从总量重算，零分母保留显式 RatioValue 状态。

## Task 2：样本充分性与 Wilson 区间

**Files:**
- Modify: `packages/domain/src/material-experiment.ts`
- Modify: `packages/domain/test/material-experiment.test.ts`

1. 写 RED tests：六种样本缺口分别输出；多个缺口顺序稳定；边界等于阈值视为满足。
2. 实现固定 95% Wilson 区间；零点击返回 unavailable，不产生 NaN。
3. 格子深冻结并带稳定 fingerprint。

## Task 3：商品级保守结论

**Files:**
- Modify: `packages/domain/src/material-experiment.ts`
- Modify: `packages/domain/test/material-experiment.test.ts`

1. 写 RED tests：0/1 合格候选、效果太小、区间重叠、观察分离、CPA 平局和多候选反例。
2. 最低有限 CPA 只作为方向候选；先检查最小改善率，再检查其 CVR 下界是否高于所有其他候选上界。
3. 只有 `separated_observation` 返回 observed leader；其余结论不带 leader。
4. 结果按 product/material 稳定排序并深冻结。

## Task 4：质量与交接

**Files:**
- Create: `docs/plans/B17-状态.md`
- Create: `docs/evidence/B17-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

1. 跑定向、Domain 全量 coverage、四包 typecheck/lint/audit、DB/Worker/Gateway 回归与 SDK opt-in。
2. 自审重复事实、浮点边界、Wilson 算法、非因果命名、资源预算、稳定排序、错误脱敏和复杂度。
3. 验证公开 Contract、migration、生产 Runtime、前端相对 B16 0 diff。
4. 写状态/证据/P-024；明确 6.7 仍缺数据接线、页面和业务策略阈值。
