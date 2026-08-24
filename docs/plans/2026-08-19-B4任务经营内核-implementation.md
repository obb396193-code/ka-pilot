# B4 任务经营内核 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 pacing、考核价版本、任务账户有效期和日报事实数据装配。

**Architecture:** 纯领域函数计算 pacing；PostgreSQL 仓储维护版本与有效期；报告装配器只输出事实，不绑定未冻结的 12 模块 UI。

**Tech Stack:** TypeScript、Vitest、PostgreSQL、pg。

---

### Task 1: Pacing 领域函数
- Create `packages/domain/src/task-pacing.ts`
- Modify `packages/domain/src/index.ts`
- Test `packages/domain/test/task-pacing.test.ts`
- TDD 覆盖正常、目标为零、结束日、已结束、最近 7 完整日、超额完成；提交 `[be] 实现任务pacing计算`。

### Task 2: 任务与考核价仓储
- Create `packages/db/src/task-repository.ts`
- Modify `packages/db/src/index.ts`
- Test `packages/db/test/task-repository.test.ts`
- TDD 覆盖租户隔离、考核价生效版本、凭证留痕、有效期重叠拒绝、按任务聚合 canonical；提交 `[be] 实现任务经营事务仓储`。

### Task 3: 日报事实装配
- Create `packages/domain/src/daily-report.ts`
- Test `packages/domain/test/daily-report.test.ts`
- 输出 task pacing/指标/数据日期/缺失项，不渲染 12 模块；提交 `[be] 实现日报事实数据装配`。

### Task 4: 质量与交付
- 四包 tests/coverage/typecheck/lint/audit/复杂度；
- Create `docs/evidence/B4-代码质量报告.md`；
- 更新 `docs/plans/B4-状态.md`、台账与 arch P-007；
- 给出功能审查 SHA。
