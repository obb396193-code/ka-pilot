# Tremor 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/tremor.json`（362 项）  
> 定位：KPI、经营驾驶舱、报告版式；业务图表运行时仍以 ECharts 为主

## 安装与获取

Tremor 官方资产分散在：

- `tremorlabs/tremor`：copy/paste React components，Apache-2.0；
- `tremorlabs/tremor-blocks`：Blocks/examples source，MIT；
- `tremorlabs/tremor-npm`：历史 npm component library，维护状态与新 raw 路径分开看。

本项目先从官方 Blocks 页面选版式，再从对应官方仓库 ref 复制源码；不默认安装整套 npm runtime。

## 使用与组合

- Tremor 擅长 KPI 卡、趋势/比较、列表、报告和 dashboard composition。
- 先复用 Block 的信息架构、间距、状态层次和响应式结构。
- 如果 Block 使用 Tremor/Recharts 图表，而产品该图要复杂交互或统一 ECharts，就保留布局与容器，替换成 ECharts adapter；不要同时长期维护两套同类业务图表。
- 小型 spark/静态展示是否直接复用，按依赖和视觉收益单项比较。

## 修改与适配

1. 颜色、字体、圆角和间距改为项目语义 token。
2. KPI 文案、指标口径、时间范围、空/错/延迟状态进入业务 adapter。
3. 去除 demo 数据和外部图片，使用脱敏 mock 或真实接口状态。
4. 图表 tooltip、axis、grid、series 颜色统一读取 ECharts theme bridge。
5. 表格/筛选功能不因 Tremor 视觉好看而绕过 ReUI/TanStack 的复杂数据能力。

## 许可证

`tremor` 主仓为 Apache-2.0，`tremor-blocks` 仓为 MIT；复制时按具体来源记录，不用“都是 Tremor”合并许可证。模板仓库也需逐仓核 license。

## 更新与变更

Tremor 多仓并存，更新前先确认资产来自哪一个仓库及其维护状态。刷新目录时分别锁 ref；本地适配后跑 KPI/报告的 light/dark、响应式、数值溢出、loading/empty/error 和 ECharts 主题回归。

## 官方来源

- Blocks：<https://www.tremor.so/blocks>
- Docs：<https://www.tremor.so/docs>
- Copy/paste components：<https://github.com/tremorlabs/tremor>
- Blocks source：<https://github.com/tremorlabs/tremor-blocks>
- Tremor organization/templates：<https://github.com/tremorlabs>
- Releases/changes：分别查看上述仓库的 releases/commits

