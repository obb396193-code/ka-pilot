# Agent 资料检索与引用指南

## 1. 开工时先查 catalog

资料相关任务先搜索 `docs/knowledge/catalog.jsonl`，不要先全盘扫描私有原文：

```bash
rg -n '快手|MAPI|实验|基建|策略中心' docs/knowledge/catalog.jsonl docs/knowledge/assessments
jq -c 'select(.source_type == "official" and (.applicable_media | index("快手")))' docs/knowledge/catalog.jsonl
```

`catalog.jsonl` 每行是独立 JSON，可用 `rg` 快速发现、用 `jq -c` 精确筛选。

### Canonical private root

`storage_ref` 是仓库相对的稳定引用，但私有原文的 canonical 根目录固定为：

```text
/Users/aik/Desktop/投放agent/private/knowledge-sources/
```

独立 worktree 可以有校验副本，但其 `/private/tmp/<worktree>/private/...` 不是跨 worktree 共享真相源。其他 Agent 在非主 worktree 读 `storage_ref` 时，必须用上述 canonical root 解析；同步副本只用于构建/校验，不得反向覆盖 canonical 且不得被 Git 跟踪。

## 2. 读取前检查四件事

1. `access_level` 与 `allowed_roles`：当前 Agent 是否有权限；
2. `lifecycle_status`：资料处在 raw、review_pending 还是 approved；
3. `review_status`：是否真的经过审查；
4. `evidence_level`：资料是官方事实、内部工作稿、竞品宣传还是 Agent 推断。

无权限时只可使用 catalog 明示允许暴露的元数据，不得读取、摘要或转述 `storage_ref` 正文。

## 3. 读取顺序

```text
catalog 记录
→ assessment_ref（先看评估和争议边界）
→ storage_ref（有权限且确需核原文时）
→ related_specs（核对当前 PRD/架构/接口现状）
```

原文是“资料说了什么”，评估是“资料研究 Agent 怎么判断”。二者冲突时以原文为来源事实，但不能把原文主张自动升级成我方事实。

若 `storage_ref` 指向 `source-manifest.json`，说明它是多文件资料包：

```text
<document_id>/source-manifest.json   包级身份、逐文件 hash、安全处理记录
<document_id>/source.sanitized.zip   合规归档
<document_id>/extracted/             授权 Agent 的本机全文检索目录
<document_id>/derived/               逐文档导读、子资产索引和覆盖报告（若已生成）
```

先读评估中的推荐子目录；若存在 `derived/document-guide.md`，先用它看人读介绍，或用 `derived/document-inventory.jsonl` 按标题、主题、质量和异常筛选，再到 `extracted/` 核原文。不要把整个包一次性塞入上下文。包级 `review_pending/approved` 只说明包的治理状态，不表示每个子文件都是正式口径。`child_asset_id` 只提供包内稳定定位；要引用或发布某一子文件，仍需资料研究 Agent 将它提升为独立 `document_id`。

若存在 `derived/product-relevance-guide.md`，必须先看产品相关性判断：

- 只有 `direct_candidate` 可进入单篇提升候选；
- `conditional_candidate` 仅在发生明确工程/研究问题时按需检索，并先补当前版本证据；
- `background_only/not_relevant/cannot_assess` 不进入产品内 Agent 默认召回，不据此新增功能；
- `use_scope=engineering_reference` 表示“可能帮助实现或排障”，不表示“应该成为产品功能”。

示例：

```bash
rg -n '实验|归因|FBI|LLM API' private/knowledge-sources/ka-src-0005/derived/document-guide.md
jq -c 'select(.quality == "substantive" and (.topics | index("实验设计")))' \
  private/knowledge-sources/ka-src-0005/derived/document-inventory.jsonl
jq -c 'select(.product_relevance == "direct_candidate")' \
  private/knowledge-sources/ka-src-0005/derived/document-inventory.jsonl
```

## 4. 未审查资料怎么用

- `raw/analyzed/review_pending` 可以供研发和审查参考，但必须标“未审查”。
- 只能写“`ka-src-0001` 主张……”或“评估认为……”，不能写“平台已经具备……”。
- 不得进入产品内 Agent 的默认可信知识范围，不得驱动自动写操作。
- 发现高价值结论时写补证或融合建议，交 `inbox-arch.md` 裁决。

### 快手 MAPI 官方资料的额外判断

检索 `ka-src-0007` 时，必须区分下列状态：

```text
documented  官方页面存在
authorized  当前 AppID/广告账户已获得 scope 或白名单
command_path_reachable  当前 CLI 有已注册命令链路（不代表 HTTP 方法正确）
method_aligned          CLI 构造的 HTTP 方法与当前官方目标页一致
verified    已在授权账户做只读或受控写探针并核对响应
```

只有 `documented` 时，不得回答“我们已经能用”。官方目标接口页与老汇总页冲突时标 `official_conflict`；写操作即使 `verified`，仍必须走变更集、预览和确认门。

```bash
rg -n 'documentId|scope|auto_build|official_conflict|实验' \
  docs/knowledge/assessments/ka-src-0007.md \
  private/knowledge-sources/ka-src-0007/extracted

# 查当前官方能力、CLI 覆盖与产品阶段
jq -c 'select(.cli_status == "not_wrapped" and .roadmap_phase == "phase1_candidate")' \
  docs/knowledge/datasets/ka-src-0007-capability-coverage.jsonl

# 查高风险或明确不纳入当前产品的能力
jq -c 'select(.risk_level == "critical" or .recommended_action == "reject_for_current_product")' \
  docs/knowledge/datasets/ka-src-0007-capability-coverage.jsonl

# 按 endpoint、documentId 或标题回到官方原文快照
rg -n 'advanced_creative/update|"documentId": 2580|修改程序化创意' \
  private/knowledge-sources/ka-src-0007/extracted/documents \
  private/knowledge-sources/ka-src-0007/extracted/inventory
```

`capability-coverage.jsonl` 的分类是未审查的研究初筛，不是产品批准清单。`phase1_candidate` 仍需业务 owner 裁剪；`not_wrapped` 只表示当前静态 CLI 未封装，不表示接口不可封装。

### 巨量引擎与腾讯广告资料

```bash
# 巨量：查结构化主接口，不要把正文 Scope/示例路径当主接口
jq -c 'select(.structured_endpoint != null)' \
  /Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0008/extracted/inventory/documents.jsonl
rg -n 'ab_test' \
  /Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0008/extracted/inventory/endpoint-candidates.jsonl

# 腾讯：先查冲突与官方原站引用，镜像 OpenAPI 禁止直接生成 SDK
jq -c 'select(.source_conflict != null or .resource_action == "split_tests/add")' \
  /Users/aik/Desktop/投放agent/private/knowledge-sources/ka-src-0009/extracted/inventory/documents.jsonl
rg -n 'split_tests|barrage_recommend' docs/knowledge/assessments/ka-src-0009.md
```

巨量引擎：`detail.path` 才是 `structured_endpoint`；正文出现的路径只是 `referenced_endpoint_candidates`。腾讯广告：`ka-src-0009` 是 E2 公开镜像，镜像归属待补证且 OpenAPI 有系统性转换错误；实现前必须回 `developers.e.qq.com` 官方原站复核。

三媒体统一使用门：

```text
documented → authorized → white-listed(if required) → wrapped → method/contract aligned → runtime verified → product enabled
```

任一中间状态缺失时，Agent 不得回答“我们已经能用”。

### 内部 ka-data 取数指南

```bash
jq -c 'select(.document_id == "ka-src-0010")' docs/knowledge/catalog.jsonl
rg -n '启航|SQL|SQLite|BI转化|现金口径|account_id|素材|商品' \
  docs/knowledge/assessments/ka-src-0010.md
```

`ka-src-0010` 为 confidential/E3 内部工作资料。无 `allowed_roles` 授权时只能看到 catalog 中允许暴露的元数据，不得读取 `storage_ref`。正文描述的服务、表、权限、对平结果和数据范围均未由本项目运行验证；引用时必须写成“资料主张”，不能回答成当前 KA 产品已接入或已可用。产品 Agent 不能依据该文档拼接任意 SQL 或索取 reader token；若 arch 后续批准接入，应只调用受控语义查询/ETL adapter，并继续执行 workspace ACL、来源血缘和字段级口径治理。

账户 ID 纠错：KA 与平台的 `account_id` 相同，不建立账户 ID 映射表；统一账户键为 `(workspace_id, media, account_id)`。R3 已于 2026-08-25 将账户主表、日指标、余额及相关账户外键同步到该键，并通过真实 PostgreSQL 跨媒体同号与孤儿反例。`task/product/material/adgroup` 等其他对象 ID 是否一致仍为 `unresolved`（待核证），不得从账户结论顺推，也不得预先创建通用映射层。引用原文的“账户双 namespace”说法时必须同时标注“已被实证否定”。

## 5. 引用格式

最小引用头：

```text
[ka-src-0001 | v0.1 | E3 | review_pending | sha256:<前12位>]
来源：<storage_ref 或 source_url>
评估：<assessment_ref>
```

官方接口引用还需附具体 `documentId`、页面版本和更新时间，不能只引用聚合入口。

正文引用必须区分：

- `事实`：能被当前官方/内部权威来源直接支持；
- `资料主张`：来源这样描述，但尚未独立核实；
- `推断`：Agent 根据资料和项目现状推导；
- `未证实`：缺接口、样本、权限或当前版本证据。

## 6. 冲突和版本

- 同一主题多份资料冲突时并列列出 `document_id/version/hash`，不静默选一个覆盖。
- `supersedes_document_id` 只表达明确替代关系；旧资料保留并标 deprecated。
- 资料正文变化但 hash 未更新视为损坏，停止引用并运行校验。
- 多文件资料包还需校验 manifest、归档和全部子文件 hash；任一漂移都停止引用整个包。
- 文档快照不是当前系统现状；能实读代码、接口或线上状态时必须复核。

## 7. 新资料交给资料研究 Agent

提供原始文件/URL、来源系统、责任方、权限和期望用途。资料研究 Agent 负责私有留存、catalog、证据分层、产品映射和审查信箱；开发 Agent 不自行把未审查材料写进冻结 PRD。
