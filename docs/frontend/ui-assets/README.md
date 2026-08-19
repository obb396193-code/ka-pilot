# 前端 UI 资产总入口

> 状态：全量目录、访问边界、高频隔离源码缓存、付费能力免费替代与离线展厅均已建立；目录收录和缓存都不等于运行时安装
> 最后更新：2026-08-19

这里是投放 Agent 前端选组件、查官方规范、看真实风格和追溯第三方源码的唯一入口。

## 先分清两件事

- **完整目录**：尽可能记录已选官方来源提供的全部 Components、Particles、Blocks、Templates、Themes 和 Motion，用于发现能力。
- **隔离源码缓存**：A 方案预先保存高概率使用的公开官方 payload/raw source，供前端 Agent 离线检查和后续复制，不参与应用编译。
- **运行仓源码**：只复制当前页面真正选定的官方源码，用于控制依赖、升级面和许可证风险。

完整目录有某项，不等于已安装。选型看 `local_status`，源码是否真的存在还必须看 `source_cache_status` 与源码 manifest：

```text
catalogued → approved/preferred → vendored → adapted → deprecated
```

当前事实：17 个产品线共 **7,056** 条逻辑资产；新入库五源合计 1,060 条，当前仍未进入源码缓存。原 A 方案已从 7 个非 shadcn 官方来源缓存 48 个根资产及 41 个必要依赖，共 **89 个缓存条目、93 份源码文件**，逐文件 SHA-256 可复核。缓存位于 `source-cache/`，尚未装入运行仓。运行仓另有 22 个 shadcn 风格本地 UI 文件，但精确 upstream ref/hash 尚未验证；第三方运行时接入仍为 0。

## 选型分层

| 需求 | 先查 | 再查 |
|---|---|---|
| 页面壳、Sidebar、基础表单/弹层 | shadcn/ui、Blocks | coss |
| 日期、组合框、Command、Field、Drawer、空态等细节 | coss Components/Particles | shadcn、ReUI |
| Data Grid、复合筛选、列配置、虚拟滚动 | ReUI、Dice UI | coss、shadcn/TanStack 示例 |
| Gantt、Kanban、Editor、上传区、复杂 Calendar | Kibo UI | Dice UI、ReUI |
| KPI、趋势、报告、驾驶舱版式 | Tremor Blocks | shadcn Blocks |
| Bento、高级卡片、背景 | Aceternity | Magic UI |
| Agent 对话、悬浮窗、推理、工具调用、来源引用 | Vercel AI Elements | shadcn primitives |
| 局部动效 | Magic UI、React Bits、Aceternity | Animate UI、Motion Primitives（只按需对比） |
| 主题/多风格 | tweakcn | 项目语义 token |

coss current 的 577 条来自当前 `coss.com/ui` Registry，采用 Base UI 新架构，是新代码默认路径；coss Origin 的 646 条是官方仓库保留的旧版快照（599 个组件/示例 + 47 个支持资产），能力更多但维护较慢，只在 current 缺能力时补位。旧 `@tremor/react` 同样只作 legacy 能力参考，新代码默认先查 Tremor Raw。

## 资料结构

- `catalogs/`：各官方来源的完整能力快照与汇总。
- `storage-format.md`：JSON/Markdown/PNG 各存什么，以及目录、访问、缓存、运行时状态的严格定义。
- `coverage-audit.json/.md`：逐库官方覆盖、会员/Pro/401、动态未知和 variant 矩阵审计。
- `source-download-manifest.json`、`source-download-status.md`：实际运行时源码、hash、引用与 provenance。
- `starter-pack.json`、`source-cache/manifest.json`：A 方案的 48 个高频根资产、传递依赖、官方 payload/raw source、逐文件 hash 和缓存状态。
- `free-alternatives.json/.md`：2,176 条已知付费元数据中，23 条分类节点单列，2,153 个具体能力逐项记录免费候选/组合策略、置信度与复核状态；当前 272 项有同能力候选、638 项按语义选图标、1,237 项需重组、6 项先核许可，不包含或推导付费源码。
- `discovery.json/.md`：老板已审阅的新来源准入记录。AI Elements、Kibo、Dice 正式进入选型，Animate UI、Motion Primitives 选择性进入对比；五者已完成目录收录，仍未冒充缓存或安装，Commons Clause 等限制单列。
- `frontend-product-standard.md`：数据密集产品的设计交付、组件实现、图表、主题、Storybook、视觉回归、无障碍和 Definition of Done。
- `showroom.html`：无需服务端、无需联网即可筛选查看的离线展厅；`showroom-data.json` 是其可再生成数据。
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
6. 先查 `source-cache/manifest.json`；命中 A 缓存就复用已校验 payload，未命中再从官方按需下载。
7. 付费但未购买时查 `free-alternatives.json`，优先同品牌 Free，其次 MIT/Apache/ISC 开源实现，最后才做独立业务组合层。
8. 在干净分支按需复制，移到来源隔离目录，补 URL/ref/hash/path/改动 manifest，做业务薄适配。
9. 通过 lint/build/可访问性/主题/响应式/状态矩阵后交付。

## 当前权威入口

- [17 库数量与查询](catalogs/README.md)
- [官方覆盖与会员边界](coverage-audit.md)
- [源码下载状态](source-download-status.md)
- [存储格式契约](storage-format.md)
- [前端 Agent 使用流程](agent-workflow.md)
- [数据产品前端执行规范](frontend-product-standard.md)
- [打开离线 UI 展厅](showroom.html)
- [高频源码缓存清单](source-cache/manifest.json)
- [付费能力免费替代](free-alternatives.md)
- [新开源来源候选](discovery.md)

## 设计与实施依据

- [体系设计](../../plans/2026-08-19-前端UI资产复用体系-design.md)
- [决策记录](../../decisions/2026-08-19-前端UI资产复用体系.md)
- [实施计划](../../plans/2026-08-19-前端UI资产复用体系-implementation.md)
- [A 方案设计](../../plans/2026-08-19-UI资产高频源码缓存与可视化展厅-design.md)
- [A 方案实施计划](../../plans/2026-08-19-UI资产高频源码缓存与可视化展厅-implementation.md)
