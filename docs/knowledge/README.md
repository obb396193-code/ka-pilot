# KA 投放经营平台 · 项目共享资料库

## 定位

本目录是“资料索引与分析评估层”，连接内部/外部资料与未来产品“知识库”Tab：

```text
原始资料 → catalog 发现 → 独立评估 → arch 审查 → approved → 产品知识库发布
```

它不是私人笔记，也不是冻结 PRD 的替代品。所有开发和审查 Agent 可以先查 `catalog.jsonl`，在权限允许时读取原始资料，再引用独立评估。未经审查的材料可作为研发线索，但不能作为正式产品口径或产品内 Agent 的默认可信知识。

## 目录

| 位置 | 是否进 Git | 用途 |
|---|---:|---|
| `private/knowledge-sources/<document_id>/` | 否 | 内部原文、附件和来源快照 |
| `docs/knowledge/catalog.jsonl` | 是 | 每行一份资料的机器可读索引 |
| `docs/knowledge/catalog.schema.json` | 是 | catalog 单条记录字段契约 |
| `docs/knowledge/assessments/` | 是 | 事实/推断分层后的独立评估 |
| `docs/knowledge/templates/source-card.md` | 是 | 录入与 20 项评估模板 |
| `docs/knowledge/agent-retrieval-guide.md` | 是 | Agent 检索和引用纪律 |
| `docs/knowledge/product-kb-publishing.md` | 是 | 未来产品知识库发布映射与门禁 |

内部原始资料允许保留真实账户 ID、账户名称、金额、考核价和内部人名，但只能放在 `private/knowledge-sources/`。Token、Cookie、AK/SK、PAT、Webhook Token、数据库密码等凭证不允许进入任何一层；只保留 `secret_ref` 或凭证托管系统说明。

## 每份资料的稳定身份

- `document_id` 格式：`ka-src-NNNN`，分配后永不复用、永不因改标题而变化。
- `current_version` 表示来源版本；来源正文变化必须更新版本与 `content_hash_sha256`。
- `content_hash_sha256` 以清除凭证值后的原始文件字节计算。
- `storage_ref` 指向原始资料，`assessment_ref` 指向独立评估；两者不能混写。

## 资料类型

`internal`（内部）｜`official`（官方）｜`competitor`（竞品）｜`open_source`（开源）｜`research`（调研）。

- 官方资料必须记录原始 URL、抓取日期、版本和更新时间；未知项写 `null` 或“未标注”，不补造。
- 第三方、竞品和开源资料必须写许可/引用边界。
- 内部资料的来源系统、作者/责任方和权限必须明确；未知就标“未知”，不能推断人名。

## 生命周期

```text
raw → analyzed → review_pending → reviewed → approved → published → deprecated
```

| 状态 | 含义 | 可否作为正式口径 | 可否进入产品知识库 |
|---|---|---:|---:|
| `raw` | 已收录，未分析 | 否 | 否 |
| `analyzed` | 已完成独立评估 | 否 | 否 |
| `review_pending` | 已提交审查 | 否 | 否 |
| `reviewed` | 审查完成但未批准 | 依审查结论 | 否 |
| `approved` | 可进入正式知识 | 是 | 可进入发布队列 |
| `published` | 已进入产品知识库 | 是 | 已发布 |
| `deprecated` | 已废弃/被替代 | 否 | 应下架或标废弃 |

`analysis_status`、`review_status` 和 `product_kb_publication_status` 分开记录，防止“写过分析”被误报成“已审查/已发布”。

## 权限

| `access_level` | 读取规则 |
|---|---|
| `public` | 按来源许可公开读取和引用 |
| `project_internal` | 仅授权的项目成员、开发/审查 Agent |
| `restricted` | 仅 `allowed_roles` 指定角色 |
| `confidential` | 仅明确授权人/角色，不进通用 Agent 默认检索 |

索引可以暴露“某资料存在”，但不得向无权角色泄露受限正文或敏感摘要。发布到产品知识库后必须继承或收紧权限，禁止自动放宽。

## 证据等级

| 等级 | 定义 |
|---|---|
| `E1` | 当前有效的官方一手文档/API 定义 |
| `E2` | 内部权威制度、正式平台文档、可复现实证 |
| `E3` | 内部工作稿、用户提供资料、真实操作经验 |
| `E4` | 竞品、第三方文章、供应商宣传 |
| `E5` | Agent 推断或待验证假设 |

评估必须进一步把关键内容拆成“已确认事实、合理推断、宣传性表达、未证实项”。

## 新资料录入流程

1. 分配稳定 `document_id`。
2. 检查权限和凭证；发现凭证值先删除，只留 `secret_ref`。
3. 内部原文保存到 `private/knowledge-sources/<document_id>/`；公开资料同时保留 URL 和抓取时间。
4. 计算原始内容 SHA-256。
5. 在 `catalog.jsonl` 新增一行，初始状态不得高于 `raw`。
6. 按 `templates/source-card.md` 生成独立评估。
7. 完成后升为 `review_pending`，写入 `docs/relay/inbox-arch.md`。
8. 只有审查 Agent 回写批准后才能标 `approved`；实际导入并核验 hash 后才标 `published`。

## 校验

```bash
node --test scripts/validate-knowledge-catalog.test.mjs
node scripts/validate-knowledge-catalog.mjs
git check-ignore -v private/knowledge-sources/probe.md
git ls-files private/knowledge-sources
```

最后一条必须无输出。若 hash、状态门、权限、私有路径或凭证检查失败，禁止提升生命周期。
