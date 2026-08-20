# 项目资料发布到产品“知识库”Tab

## 1. 单一来源原则

仓库资料层是建设期 source of truth。产品知识库是发布目标，不是另一套手工编辑正文。发布记录必须复用相同 `document_id` 和 `content_hash`；任何漂移都阻断发布。

内部原文从授权的 `storage_ref` 读取；产品知识库必须继承或收紧 `visibility/allowed_roles`。若要把评估结论作为独立知识正文发布，应给该派生资产单独的 `document_id` 和 hash，不能冒充原始资料正文。

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
