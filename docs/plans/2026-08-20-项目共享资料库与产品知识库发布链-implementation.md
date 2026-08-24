# 项目共享资料库与产品知识库发布链 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立私有原始资料区、Git 内机器索引和独立评估层，完成首篇白盒/黑盒资料录入并提交 arch 审查。

**Architecture:** 内部原文放 `private/knowledge-sources/` 并由 `.gitignore` 阻断；`docs/knowledge/catalog.jsonl` 是发现与状态索引，`assessments/` 只放可审查判断。无依赖 Node 校验器检查 JSONL、字段、状态门、hash、私有路径、Git 跟踪和凭证形态；产品知识库未来只导入 `approved` 记录。

**Tech Stack:** Markdown、JSON Lines、JSON Schema Draft 2020-12、Node.js 内置模块、Git。

---

### Task 1: 状态文档与安全边界

**Files:**
- Create: `docs/plans/research-kb-状态.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `.gitignore`

1. 先写状态文档，逐条列正式任务 10 项与当前状态。
2. 在工作台账记录角色、独立分支、范围和“未触碰 Claude 工作区”。
3. 在 `.gitignore` 增加 `/private/knowledge-sources/`。
4. 运行 `git check-ignore -v private/knowledge-sources/probe.md`，预期命中根 `.gitignore`。
5. 提交：`git commit -m "[codex] 注册资料研究任务与私有区"`。

### Task 2: 先写失败测试和 catalog 校验器

**Files:**
- Create: `docs/knowledge/catalog.jsonl`
- Create: `docs/knowledge/catalog.schema.json`
- Create: `scripts/validate-knowledge-catalog.mjs`
- Create: `scripts/validate-knowledge-catalog.test.mjs`

1. 测试重复 ID、缺字段、非法状态、未批准即 published、缺评估、缺私有原文、hash 不一致、私有原文被 Git 跟踪、凭证形态。
2. 运行 `node --test scripts/validate-knowledge-catalog.test.mjs`，确认因实现缺失而失败。
3. 实现 `parseCatalog`、`validateRecord`、`validateRepository` 和 CLI。
4. 运行测试，预期全绿。
5. 更新状态文档与台账。
6. 提交：`git commit -m "[codex] 建立资料索引校验门"`。

### Task 3: 建立共享规范和模板

**Files:**
- Create: `docs/knowledge/README.md`
- Create: `docs/knowledge/templates/source-card.md`
- Create: `docs/knowledge/agent-retrieval-guide.md`
- Create: `docs/knowledge/product-kb-publishing.md`

1. 测试四份文档存在并含生命周期、权限、证据、检索、引用和发布门关键词。
2. 运行测试确认失败。
3. 编写目录说明、20 项评估模板、Agent 检索指南和产品字段映射。
4. 运行测试和 catalog CLI，预期通过。
5. 更新状态文档与台账。
6. 提交：`git commit -m "[codex] 建立资料检索评估与发布规范"`。

### Task 4: 录入首篇资料

**Files:**
- Create (ignored): `private/knowledge-sources/ka-src-0001/source.md`
- Create: `docs/knowledge/assessments/ka-src-0001.md`
- Modify: `docs/knowledge/catalog.jsonl`

1. 测试要求 `ka-src-0001` 存在且状态为 `review_pending`、E3、`project_internal`。
2. 运行测试确认失败。
3. 原样保存用户提供的白盒/黑盒文档到私有区；确认无 Token/Cookie/AK/SK/PAT/Webhook Token/数据库密码。
4. 计算 `shasum -a 256 private/knowledge-sources/ka-src-0001/source.md`。
5. 按 20 项模板写独立评估，逐项对照 KA 产品，并区分事实、推断、宣传与未证实。
6. 写 catalog 记录和 `storage_ref`。
7. 运行测试、CLI、`git check-ignore`、`git ls-files private/knowledge-sources`（预期空）。
8. 更新状态文档与台账。
9. 提交：`git commit -m "[codex] 录入白盒黑盒资料与独立评估"`。

### Task 5: 注册角色提议与 arch 审查信箱

**Files:**
- Modify: `docs/relay/README.md`
- Modify: `docs/relay/inbox-arch.md`

1. 只新增 research/knowledge 角色提议，不修改其他角色边界。
2. 在 inbox-arch 新增自包含条目，写清角色、职责、边界、分支、基线、功能 SHA、目录、catalog、评估、storage_ref、Git/私有内容边界、事实/推断/未证实、融合/仅知识库/驳回建议、发布与补证问题。
3. 运行全部测试、CLI、`git diff --check`、私有区跟踪检查。
4. 更新状态文档与台账为“已交审，等待裁决”。
5. 提交：`git commit -m "[codex] 提交资料知识资产首批审查"`。
6. `git show --stat HEAD` 自查后停止，不实施融合。
