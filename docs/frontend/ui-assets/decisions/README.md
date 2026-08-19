# UI 能力选择记录

这里保存“同一能力存在多个官方实现”时的比较和拍板结果。

## 状态规则

- `待拍板`：已经列出真实预览和工程差异，但没有替老板选；目录项保持 `catalogued` 或 `approved`。
- `已选`：老板明确选择，给选中项写入 `preferred`、`comparison_record`、`decision_record` 和适用范围。
- `已落地`：官方源码按需复制进来源隔离目录，状态推进到 `vendored/adapted`，记录上游 ref 与本地路径。

## 当前记录

| 能力 | 文档 | 状态 | 是否已经安装源码 |
|---|---|---|---|
| 日期/日期范围选择 | [date-picker.md](date-picker.md) | 待拍板；已给分场景建议 | 否 |

前端 Agent 不能因为文档有“推荐”就擅自写 `preferred`；只有明确拍板后才更新状态。
