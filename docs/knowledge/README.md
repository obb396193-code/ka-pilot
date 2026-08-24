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
| `private/knowledge-sources/<document_id>/derived/` | 否 | confidential 逐文档导读、子资产索引与覆盖报告 |
| `docs/knowledge/catalog.jsonl` | 是 | 每行一份资料的机器可读索引 |
| `docs/knowledge/catalog.schema.json` | 是 | catalog 单条记录字段契约 |
| `docs/knowledge/assessments/` | 是 | 事实/推断分层后的独立评估 |
| `docs/knowledge/datasets/` | 是 | 经分析生成的机器可读能力矩阵；不是原始资料，也不自动等于获批产品能力 |
| `docs/knowledge/guides/` | 是 | 对已编号资料的专题导读；不新建原文真相源，必须回链 document_id |
| `docs/knowledge/templates/source-card.md` | 是 | 录入与 20 项评估模板 |
| `docs/knowledge/agent-retrieval-guide.md` | 是 | Agent 检索和引用纪律 |
| `docs/knowledge/product-kb-publishing.md` | 是 | 未来产品知识库发布映射与门禁 |

内部原始资料允许保留真实账户 ID、账户名称、金额、考核价和内部人名，但只能放在 `private/knowledge-sources/`。Token、Cookie、AK/SK、PAT、Webhook Token、数据库密码等凭证不允许进入任何一层；只保留 `secret_ref` 或凭证托管系统说明。

## 每份资料的稳定身份

- `document_id` 格式：`ka-src-NNNN`，分配后永不复用、永不因改标题而变化。
- `current_version` 表示来源版本；来源正文变化必须更新版本与 `content_hash_sha256`。
- `content_hash_sha256` 以清除凭证值后的原始文件字节计算。
- `storage_ref` 指向原始资料，`assessment_ref` 指向独立评估；两者不能混写。

多文件资料包使用 `source-manifest.json` 作为 `storage_ref`。manifest 必须列出每个子文件的相对路径与 hash，并在同级保留 `source.sanitized.zip` 和 `extracted/` 可检索副本。catalog 的 `content_hash_sha256` 对 manifest 本身计算；校验器同时复核归档 hash、全部子文件 hash 和凭证形态。资料包通过审查不等于包内每篇文档都获批；需要进入产品知识库的子文档必须单独分配 `document_id`、评估和审查。

资料包可以在同级 `derived/` 生成私有逐文档导读。每个文件分配稳定 `child_asset_id`，记录路径、hash、抽取式介绍、主题、质量异常和子文件治理状态。`child_asset_id` 只用于包内发现和追溯，不等于获批的正式 `document_id`；派生导读不得改变父 manifest hash，也不得因生成了摘要就提升审查或发布状态。

“资料存在”与“对产品有用”必须分开。逐文档索引应额外记录 `product_relevance`、`recommended_action`、`use_scope`、`roadmap_phase`、`related_product_modules`、`relevance_reason`、`product_takeaway`、`adoption_boundary` 和 `relevance_priority`。内部平台资料即使真实，也可能只适合工程按需排障、行业背景或完全无关；不得因为由 OS/内网 Agent 拉取就默认进入 PRD、路线图或产品知识库。

## 资料类型

`internal`（内部）｜`official`（官方）｜`competitor`（竞品）｜`open_source`（开源）｜`research`（调研）。

- 官方资料必须记录原始 URL、抓取日期、版本和更新时间；未知项写 `null` 或“未标注”，不补造。
- 动态官方接口站除入口 URL 外，还要记录目标页 `documentId/menuId`、接口版本、页面更新时间、endpoint/method、scope、白名单、限额与抓取日期。目标接口页和汇总说明冲突时不得静默择一，标记 `official_conflict` 并等待只读探针或媒体确认。
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
| `E2` | 高可信但非一手或归属待补证的公开镜像、内部权威制度、可复现实证 |
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

官方 API 资料额外遵守：网页公开可见只证明 `documented`，不证明当前账户 `authorized`、执行壳 `wrapped` 或运行时 `verified`。凭证形态的官方请求样例不进入快照；只保存字段名、接口定义和无凭证证据。

多文件资料包在第 2–4 步之间还要完成：路径穿越/符号链接/加密条目检查、逐文件凭证清除、重复与空文件统计、manifest 生成。不得把带签名 URL、AK 标识或访问签名的下载原包直接设为 canonical storage。

若需要让人逐篇了解资料包内容，运行仓库内的导读生成器，把输出写入 ignored 私有目录：

```bash
python3 scripts/build-knowledge-bundle-guide.py \
  --document-id ka-src-0005 \
  --source-root private/knowledge-sources/ka-src-0005/extracted \
  --manifest private/knowledge-sources/ka-src-0005/source-manifest.json \
  --output-dir private/knowledge-sources/ka-src-0005/derived
```

生成结果仍是未审查的抽取式导读；不能用它替代单篇评估。

生成器同时输出 `product-relevance-guide.md`。相关性分级含义：

- `direct_candidate`：直接对应 KA 产品问题，但仍需单篇审查；
- `conditional_candidate`：只在版本、接口、权限和适配性补证后按需使用；
- `background_only`：只作工程/行业/项目背景，不形成产品需求；
- `not_relevant`：明确排除出产品设计、路线图和默认知识；
- `cannot_assess`：正文缺失，不能凭标题猜价值。

## 校验

```bash
node --test scripts/validate-knowledge-catalog.test.mjs
node scripts/validate-knowledge-catalog.mjs
git check-ignore -v private/knowledge-sources/probe.md
git ls-files private/knowledge-sources
```

最后一条必须无输出。若 hash、状态门、权限、私有路径或凭证检查失败，禁止提升生命周期。
