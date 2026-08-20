# B18 素材设计 Brief 与回测就绪设计

> 日期：2026-08-21
> 产品依据：验收 6.5“跑量素材→brief→设计师→上线自动关联回测”
> 边界：纯 Domain；不接钉钉、AIGC、DB/API/页面或自动投放

## 1. 目标

把“复刻一下这个素材”从聊天消息变成可审计的结构化任务：绑定源素材分析版本，说明必须保留什么，每个变体只改一个维度，交付后绑定复刻谱系；只有 B17 的样本格子充足时才进入可回测。

## 2. 方案

- 不选自由文本 brief：容易丢源版本、变量混改、无法自动回测。
- 采用严格结构化 brief：一个 brief 绑定一个商品和源素材；每个 variant 只有一个 `changeDimension`，有假设、执行说明和不变量；所有 ID/版本/fingerprint 严格校验。
- 不做完整制作工作流：设计师、钉钉、AIGC 下单和文件交付留给集成契约。

## 3. Brief

包含：

- brief/schema 版本、商品版本、源素材版本；
- 源 teardown/profile fingerprint；
- 目标与全局约束；
- 1~20 个变体：唯一 key、单一改变维度、假设、执行说明、必须保持的其他维度；
- B17 experiment policy fingerprint；
- 创建人、规范时间、稳定 fingerprint。

改变维度固定为 hook、selling_point、audience、rhythm、cta、visual_style。每个变体必须至少保留一个其他维度，且不得把自己的改变维度同时写入 keep。

## 4. 交付与回测就绪

交付记录绑定 brief fingerprint + variant key + 派生素材版本 + B16 lineage fingerprint。一个 variant 只能对应一个派生素材；重复完全相同幂等，冲突失败。

回测状态：

- `awaiting_delivery`：仍有变体未交付；
- `awaiting_sample`：全部交付，但 B17 对应商品下仍有派生素材样本不足/缺失；
- `ready`：全部交付，且每个派生素材在同一 B17 policy 下 sampleStatus=sufficient。

这里只判断能不能回测，不宣称效果好坏，也不自动生成新变体或投放。

## 5. 安全与上限

- 最多 20 个变体、20 个交付；文本单项最多 4000 字；
- 输出深冻结、稳定排序和 fingerprint；
- 错误只暴露稳定码，不回显 brief 内容或内部标识；
- B17 policy fingerprint 必须与 brief 的测试策略一致，否则 fail-closed。

## 6. 未完成

- Agent 生成 brief 草稿、人工编辑/发布状态；
- 钉钉设计师派发、AIGC 下单、素材文件回传；
- 复刻谱系持久化、素材上线映射、自动取 B17 事实；
- DB/API/页面和任何媒体写操作。
