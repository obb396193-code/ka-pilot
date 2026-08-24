# 项目资料发布到产品“知识库”Tab

## 1. 单一来源原则

仓库资料层是建设期 source of truth。产品知识库是发布目标，不是另一套手工编辑正文。发布记录必须复用相同 `document_id` 和 `content_hash`；任何漂移都阻断发布。

内部原文从授权的 `storage_ref` 读取；产品知识库必须继承或收紧 `visibility/allowed_roles`。若要把评估结论作为独立知识正文发布，应给该派生资产单独的 `document_id` 和 hash，不能冒充原始资料正文。

多文件资料包不能以“整包 approved”直接展开成数百篇产品知识。发布前必须从包内选出目标子文档，单独分配 `document_id`、确定正文边界、权限、版本、hash、证据等级和审查结论；包级 manifest 仅用于溯源和完整性校验。

官方 API 全量目录可以附带机器能力矩阵，但矩阵与完整网页快照分开发布：矩阵用于 endpoint/documentId/版本/风险/覆盖状态检索，完整快照仍按 `storage_ref` 受控读取。某条能力只有在 `approved` 后才能进入产品内 Agent 的默认工具/知识范围；全量父资料获批不等于数百个 endpoint 自动获批实现。

子文档提升前还必须通过产品相关性门：`direct_candidate` 才能直接进入单篇审查队列；`conditional_candidate` 需先补当前接口/版本/权限/适配证据并由审查人确认用途；`background_only/not_relevant/cannot_assess` 默认不得发布到产品知识库或进入产品内 Agent 的可信召回范围。工程排障参考与产品知识是两个用途，不能混为一谈。

## 2. 发布前置条件

- `lifecycle_status=approved`
- `review_status=approved`
- `product_kb_publication_status=ready`
- 内容 hash 校验通过
- 原始资料不存在凭证值
- 权限和允许角色已审查
- 许可/引用边界允许当前发布方式
- 审查人、审查时间和引用清单完整

不满足任一条件，只能留在项目资料库，不能进入产品内 Agent 的默认可信知识。

## 3. 字段映射

| 产品知识库字段 | 仓库来源 | 发布规则 |
|---|---|---|
| `document_id` | `catalog.document_id` | 原样复用，禁止重新生成 |
| `source` | `original_source/source_system` | 保留来源系统与责任方 |
| `title` | `title` | 原样或审查批准的展示标题 |
| `content` | `storage_ref` | 按权限读取的已批准原文；不手工复制 |
| `revision` | `current_version` | 来源版本，变更触发重审 |
| `content_hash` | `content_hash_sha256` | 产品落库后重算并逐字节核对 |
| `visibility` | `access_level` | 只允许等价或更严格映射 |
| `allowed_roles` | `allowed_roles` | 原样继承，可由审查收紧，不可自动放宽 |
| `asset_state` | `lifecycle_status` | approved→approved，published→published，deprecated→deprecated |
| `evidence_level` | `evidence_level` | 原样继承 |
| `reviewed_by` | 审查回执 | 必填，使用稳定人员/角色 ID |
| `reviewed_at` | 审查回执 | 必填，ISO 8601 |
| `published_at` | 发布任务结果 | 实际成功落库时间，不用计划时间 |
| `source_url` | `source_url` | 官方/公开来源必填；内部资料可为空 |
| `source_file_ref` | `storage_ref` | 保存受控引用，不把本机路径公开给无权用户 |
| `citations` | 评估卡+审查回执 | 结构化列出原文位置、外部 URL 和关联规范 |
| `related_business_objects` | `applicable_media/applicable_business/related_product_modules` | 转为媒体、业务、任务/账户等对象关系 |
| `supersedes_document_id` | `supersedes_document_id` | 仅明确版本替代时填写 |

官方/API 资料建议额外发布 `source_authority`、`contract_status`、`capability_state`、`source_conflicts`、`captured_at`、`source_updated_at`。这些字段从 manifest/评估/审查回执生成，不得用“页面抓取成功”自动填成 `official/executable/verified`。镜像资料必须保留 mirror ownership 和已知转换错误；有冲突的 endpoint 同时保留 observed/corrected 值和官方证据 URL。

## 4. 发布流程

```text
catalog 选择 approved 记录
→ 权限/许可/凭证复检
→ 读取 storage_ref
→ 重算 hash
→ 生成只读发布包
→ 产品知识库 upsert(document_id, revision)
→ 回读 content/hash/ACL
→ 全部一致才回写 published
```

upsert 必须幂等；同一 `document_id+revision+hash` 重放不新增副本。若同 ID 同版本出现不同 hash，进入冲突状态，不覆盖线上正文。

## 5. 权限继承

| 仓库权限 | 产品建议映射 |
|---|---|
| `public` | 允许已登录用户或公开范围，仍受许可证限制 |
| `project_internal` | KA 项目成员/授权 Agent |
| `restricted` | 只允许 catalog 指定角色 |
| `confidential` | 明确授权名单，不进入通用搜索召回 |

搜索索引、向量索引、摘要缓存和 Agent 引用都必须执行同一 ACL；不能只保护正文页面而让检索结果泄露标题、摘要或片段。

## 6. 更新、废弃与回滚

- 来源更新：仓库更新版本/hash，状态退回 `analyzed` 或 `review_pending`，重新审查再发布。
- 产品内纠错：生成修订请求回到仓库，不直接改第二份正文。
- 废弃：catalog 标 `deprecated` 并指向替代 ID；产品知识库同步下架或显式标废弃。
- 发布失败：保留产品端原已发布版本，记录失败原因；不得把 catalog 标为 published。

## 7. 当前批次边界

本文件只定义映射与发布门。本批不实现产品知识库前端、导入 API、数据库迁移或 PRD/Contract 变更；这些必须在 arch 审查通过后单独立项。

## 8. 已确认的后续发布要求（2026-08-24）

产品 owner 已明确：本项目整理的资料不能永久只停留在仓库资料层；它们都应进入产品知识库发布候选队列，经过分析、审查和批准后，由统一导入/发布流程上传到产品“知识库”Tab，供获授权的业务用户和产品内 Agent 检索引用。

这里的“都进入发布候选队列”不等于“整批无条件公开或原样上传”：

- `approved/ready` 的资料或经审查选出的子文档，后续必须进入正式发布任务，不得仅以仓库归档代替产品落库；
- `raw/analyzed/review_pending`、被驳回、许可不明或权限不满足的资料继续留在项目资料库，不得绕过发布门；
- confidential/private 原文是否发布全文、摘要或仅发布受控引用，由审查结果和 ACL 决定；进入知识库也不能自动放宽权限；
- 发布仍以仓库同一 `document_id/revision/content_hash` 为唯一逻辑来源，不另手工维护第二份正文；
- 产品知识库导入能力、回读校验、ACL/向量索引隔离和发布回执需要另立实现批次，本轮只登记强制后续方向。
