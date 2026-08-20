# Agent 资料检索与引用指南

## 1. 开工时先查 catalog

资料相关任务先搜索 `docs/knowledge/catalog.jsonl`，不要先全盘扫描私有原文：

```bash
rg -n '快手|MAPI|实验|基建|策略中心' docs/knowledge/catalog.jsonl docs/knowledge/assessments
jq -c 'select(.source_type == "official" and (.applicable_media | index("快手")))' docs/knowledge/catalog.jsonl
```

`catalog.jsonl` 每行是独立 JSON，可用 `rg` 快速发现、用 `jq -c` 精确筛选。

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
```

先读评估中的推荐子目录，再在 `extracted/` 做定向 `rg`；不要把整个包一次性塞入上下文。包级 `review_pending/approved` 只说明包的治理状态，不表示每个子文件都是正式口径。要引用或发布某一子文件，优先要求资料研究 Agent 将它提升为独立 `document_id`。

## 4. 未审查资料怎么用

- `raw/analyzed/review_pending` 可以供研发和审查参考，但必须标“未审查”。
- 只能写“`ka-src-0001` 主张……”或“评估认为……”，不能写“平台已经具备……”。
- 不得进入产品内 Agent 的默认可信知识范围，不得驱动自动写操作。
- 发现高价值结论时写补证或融合建议，交 `inbox-arch.md` 裁决。

## 5. 引用格式

最小引用头：

```text
[ka-src-0001 | v0.1 | E3 | review_pending | sha256:<前12位>]
来源：<storage_ref 或 source_url>
评估：<assessment_ref>
```

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
