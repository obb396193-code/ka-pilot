# 日期与日期范围选择器：官方实现对比

> 状态：**待老板在真实业务页视觉对比后拍板**
>
> 对比日期：2026-08-19
>
> 当前目录：`capabilities.json` 的 `date-picker` 能力族，共 30 个候选，来自 coss、shadcn、ReUI、Tremor。

## 需求场景

- 投放列表与数据分析页需要单日、日期范围和常用时间段筛选。
- 必须支持中文、周一为一周起点、受控值、清空、键盘操作、暗色和窄屏。
- 后续可能需要“今天/昨天/近 7 天/近 30 天”预设与双月范围视图。
- 不为这个控件另起一套全站设计系统；必须接项目 token。

## 候选总览

| 候选 | 官方真实预览/源码 | 底层 | 新依赖与隔离 | 主题/许可证 | 预计适配 | 当前判断 |
|---|---|---|---|---|---|---|
| coss `p-date-picker-2` | [Particle](https://coss.com/ui/particles?search=p-date-picker-2) · [Registry JSON](https://coss.com/ui/r/p-date-picker-2.json) | Base UI + Calendar/Popover/Button | `date-fns`、`lucide-react`；coss primitives 进独立目录 | token-ready；`apps/ui` 路径 MIT，复制前再核文件 | 中 | **简单日期范围首推**；细节最符合已拍板方向 |
| coss `p-date-picker-9` | [Particle](https://coss.com/ui/particles?search=p-date-picker-9) · [Registry JSON](https://coss.com/ui/r/p-date-picker-9.json) | Base UI；双月范围 | 同上 | 同上 | 中 | 桌面宽屏范围选择备选；窄屏需改单月 |
| shadcn `date-picker-with-range` | [官方 Date Picker](https://ui.shadcn.com/docs/components/date-picker) · [源码](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/examples/date-picker-with-range.tsx) | 当前 shadcn/Radix 基础 | 基本不新增底层，只组合 Calendar + Popover | token-ready；MIT | 低 | **最低工程风险备选**；视觉细节相对基础 |
| ReUI `c-calendar-29` | [Calendar 真实组件页](https://reui.io/components/calendar) · [Registry](https://reui.io/r/registry.json) | 当前抓取为 Base UI base-nova；上游另有 Radix styles | `date-fns`、`react-day-picker`、Card/Popover | theme-ready；MIT | 中高 | **日期范围 + 预设功能最完整候选**；先确认 style 与目标页密度 |
| Tremor `DatePicker` / `DateRangePicker` | [官方 Date Picker](https://www.tremor.so/docs/inputs/date-picker) · [源码目录](https://github.com/tremorlabs/tremor/tree/main/src/components/DatePicker) | Tremor React/Radix 体系 | 会引入 Tremor 自身组件模式；内含 presets、locale、apply/cancel | 主题需转换；Apache-2.0 | 高 | 功能成熟但体系重复，暂不作为首选 |

## 官网风格基线

![coss 日期选择器官网截图](../screenshots/coss-date-picker.png)

这张图只证明 coss 默认控件的视觉与文档结构；真正拍板时，前端 Agent 还要把上表候选放进**同一个投放筛选栏**，用相同中文文案、宽度、主题和数据状态截图并排展示，不能拿不同官网页面尺寸直接比。

## 分场景建议，不替老板终裁

- 只需要单日/简单范围：先做 coss `p-date-picker-2` 真实页预览，同时放 shadcn range 对照。
- 需要范围 + 常用预设：把 ReUI `c-calendar-29` 与 coss `p-date-picker-2` 并排；若选择 coss，不得为补预设手写一大套，先继续查 coss 其他 Calendar/Particles。
- 宽屏双月范围：把 coss `p-date-picker-9` 作为第三个候选；移动端必须降为单月。
- Tremor 只在前三项无法满足 apply/cancel、时间选择或本地化时再进入最终轮。

## 拍板前验证清单

1. inspect Registry 实际文件和传递依赖，不直接执行 add；
2. 校验 `@daypicker/react` / `react-day-picker` 版本，coss 当前已迁移 DayPicker 10；
3. 验证中文 locale、周起始日、禁用未来日期、受控值和 URL 查询参数同步；
4. 验证 portal root、focus return、Escape、Tab/方向键和读屏标签；
5. 验证 light/dark、至少 3 个 tweakcn 主题、320px 窄屏和双月降级；
6. 老板选择后再更新 `preferred`，随后才按需复制源码。

## 待填写的最终结果

- 选择结果：待拍板
- 适用范围：待拍板
- 不适用范围：待拍板
- 本地路径：尚未复制
- 重新评估触发：上游 breaking change、DayPicker 大版本、主题契约变化或业务需要时间选择。
