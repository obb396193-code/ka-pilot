# 前端 UI 资产总入口

> 状态：官方目录与访问边界已完成二次审计；目录收录不代表源码已经安装
> 最后更新：2026-08-19

这里是投放 Agent 前端选组件、查官方规范、看真实风格和追溯第三方源码的唯一入口。

## 先分清两件事

- **完整目录**：尽可能记录已选官方来源提供的全部 Components、Particles、Blocks、Templates、Themes 和 Motion，用于发现能力。
- **运行仓源码**：只复制当前页面真正使用的官方源码，用于控制依赖、升级面和许可证风险。

完整目录有某项，不等于已安装。选型看 `local_status`，源码是否真的存在还必须看 `source_cache_status` 与源码 manifest：

```text
catalogued → approved/preferred → vendored → adapted → deprecated
```

当前事实：12 个产品线共 **5,936** 条逻辑资产，`source_cache_status=not-cached` 为 5,936；运行仓另有 22 个 shadcn 风格本地 UI 文件，但精确 upstream ref/hash 尚未验证；coss/ReUI/Tremor 等选定第三方源码尚未接入。

## 选型分层

| 需求 | 先查 | 再查 |
|---|---|---|
| 页面壳、Sidebar、基础表单/弹层 | shadcn/ui、Blocks | coss |
| 日期、组合框、Command、Field、Drawer、空态等细节 | coss Components/Particles | shadcn、ReUI |
| Data Grid、复合筛选、列配置、虚拟滚动 | ReUI | shadcn/TanStack 示例 |
| KPI、趋势、报告、驾驶舱版式 | Tremor Blocks | shadcn Blocks |
| Bento、高级卡片、背景 | Aceternity | Magic UI |
| 局部动效 | Magic UI、React Bits | Aceternity |
| 主题/多风格 | tweakcn | 项目语义 token |

coss Origin 与旧 `@tremor/react` 只作为 legacy 能力参考；新代码默认先查 current coss 与 Tremor Raw。

## 资料结构

- `catalogs/`：各官方来源的完整能力快照与汇总。
- `storage-format.md`：JSON/Markdown/PNG 各存什么，以及目录、访问、缓存、运行时状态的严格定义。
- `coverage-audit.json/.md`：逐库官方覆盖、会员/Pro/401、动态未知和 variant 矩阵审计。
- `source-download-manifest.json`、`source-download-status.md`：实际运行时源码、hash、引用与 provenance。
- `guides/`：官方安装、使用、组合、修改/迁移、主题、许可证和 changelog 的项目摘要。
- `capabilities.json`：跨来源能力索引，用一个需求找到多个候选。
- `visual-guide.md`：真实官网截图和风格归类。
- `decisions/`：首选资产和未选方案的理由。
- `comparison-template.md`：第一次出现多候选时的对比格式。
- `licenses.md`：免费/Pro/copyleft/再分发边界。
- `source-health.json`：官方入口的最后核验状态。

## 快速流程

1. 用能力词查 `capabilities.json` 与各来源目录。
2. 打开官方 preview 和对应 guide，不只看名字。
3. 若已有 `preferred` 且场景相同，直接复用。
4. 若有多个未裁决候选，按模板做真实预览与工程对比，老板拍板。
5. 先检查 `access_status`；付费项只在取得合法许可后 inspect Registry/源码。
6. 在干净分支按需复制，移到来源隔离目录，补 URL/ref/hash/path/改动 manifest，做业务薄适配。
7. 通过 lint/build/可访问性/主题/响应式/状态矩阵后交付。

## 当前权威入口

- [12 库数量与查询](catalogs/README.md)
- [官方覆盖与会员边界](coverage-audit.md)
- [源码下载状态](source-download-status.md)
- [存储格式契约](storage-format.md)
- [前端 Agent 使用流程](agent-workflow.md)

## 设计与实施依据

- [体系设计](../../plans/2026-08-19-前端UI资产复用体系-design.md)
- [决策记录](../../decisions/2026-08-19-前端UI资产复用体系.md)
- [实施计划](../../plans/2026-08-19-前端UI资产复用体系-implementation.md)
