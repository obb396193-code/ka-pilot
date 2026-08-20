# 资料录入与评估模板

> 本模板一份资料使用一次。原始正文不粘贴到评估文档；内部原文放 `private/knowledge-sources/<document_id>/`。

## A. Catalog 元数据

```yaml
document_id: ka-src-NNNN
title:
source_type: internal | official | competitor | open_source | research
original_source:
source_file_location:
source_system:
author_or_owner:
published_at:
ingested_at:
current_version:
content_hash_sha256:
applicable_media: []
applicable_business: []
access_level: public | project_internal | restricted | confidential
allowed_roles: []
evidence_level: E1 | E2 | E3 | E4 | E5
analysis_status: not_started | in_progress | completed
lifecycle_status: raw | analyzed | review_pending | reviewed | approved | published | deprecated
review_status: not_submitted | pending | in_review | reviewed | approved | rejected
product_kb_publication_status: not_ready | ready | published | deprecated
supersedes_document_id:
deprecated_by_document_id:
related_product_modules: []
related_specs: []
storage_ref:
assessment_ref:
source_url:
license:
  status:
  citation_boundary:
tags: []
```

## B. 入库安全检查

- [ ] 内部原文只在 `private/knowledge-sources/`，没有被 Git 跟踪。
- [ ] Token、Cookie、AK/SK、PAT、Webhook Token、数据库密码等凭证值已删除。
- [ ] 需要说明凭证归属时只保留 `secret_ref` 或托管系统名称。
- [ ] 权限等级和允许角色已由资料提供方或制度确认；未知处未擅自放宽。
- [ ] 公开资料记录 URL、抓取日期、版本和更新时间。
- [ ] 第三方资料记录许可和引用边界。
- [ ] 内容 hash 已由最终原始文件计算。
- [ ] 若为多文件资料包：已生成 `source-manifest.json`，逐文件 hash、归档 hash、可检索 `extracted/` 路径和凭证清除计数完整。
- [ ] 若为多文件资料包：已明确“包级审查不等于子文档获批”，待发布子文档会另分配 `document_id`。

## C. 独立评估

### 1. 原始资料摘要

### 2. 已确认事实

### 3. 合理推断

### 4. 宣传性表达

### 5. 未证实项

### 6. 对我们产品是否有帮助

### 7. 对应现有功能

### 8. 已包含能力

### 9. 部分包含能力

### 10. 缺失能力

### 11. 与现有设计冲突的地方

### 12. 可以直接借鉴的内容

### 13. 不建议照搬的内容及原因

### 14. 对 PRD 的影响

### 15. 对后端架构的影响

### 16. 对前端产品设计的影响

### 17. 对 Agent、工作流、知识库的影响

### 18. 建议动作：融合 / 补证 / 仅参考 / 不采用

### 19. 建议优先级

### 20. 需要审查 Agent 裁决的问题

## D. 引用要求

引用时至少带：`document_id`、来源版本、内容 hash、证据等级、生命周期、审查状态、`storage_ref/assessment_ref`。
