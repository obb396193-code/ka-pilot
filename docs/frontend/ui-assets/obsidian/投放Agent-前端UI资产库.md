---
title: 投放 Agent 前端 UI 资产库
updated: 2026-08-19
tags:
  - vibemotion
  - 投放Agent
  - 前端
  - UI资产
---

# 投放 Agent 前端 UI 资产库

> 续作入口。全量目录核心提交：`0b4884b`；A 方案高频缓存、免费替代和离线展厅在后续 Task 8 提交。本页是便于 Obsidian 阅读的快照，权威数据仍以仓库 JSON、缓存 manifest 和实时校验结果为准。

## 一句话结论

已经把 12 条官方产品线整理成可搜索目录，共 **5,996 个逻辑资产**；这表示“官方有什么可以查”，**不表示 5,996 份源码已经下载**。老板选择的 A 方案已经从 7 个非 shadcn 官方来源缓存 **48 个高频根资产 + 41 个必要依赖＝89 个缓存条目、93 份源码文件**，失败 0，逐文件 SHA-256 可复核。缓存位于文档隔离区，不参与应用编译。项目运行仓仍只有 22 个 shadcn 风格 UI 文件、20 个正被引用，但没有精确上游 ref/hash，只能标为来源推断；第三方运行时接入为 0。

## 当前全量目录

| 产品线 | 逻辑资产 | 覆盖口径 | 访问边界 |
|---|---:|---|---|
| shadcn | 473 | New York v4 471 条 + 当前逻辑索引独有 2 条 | 414 公开源码，59 配置/元数据 |
| coss current | 577 | 当前 Registry 完整 | 570 公开源码，7 配置/元数据 |
| coss Origin | 646 | 官方保留的 legacy Registry 完整 | 全部公开源码，另有 2 个 repo-only internal 不计入 |
| ReUI | 2,315 | Registry + 官方 llms 索引完整 | 1,149 公开；1,166 购买授权后源码 |
| Tremor current | 375 | Raw、5 utilities、323 Blocks、6 Templates 与关联变体 | 全部公开源码 |
| Tremor legacy | 30 | 仍在线的 `@tremor/react` 3.18.7 文档能力 | 全部公开，标 maintenance-stale，不擅自说 deprecated |
| Aceternity | 319 | 官方 AI recommendations 索引完整 | 112 Free，207 Pro |
| Magic UI Free | 247 | 免费 Registry 完整 | 246 公开源码，1 配置/元数据 |
| Magic UI Pro | 104 | 公开可复现下限，不是品牌全量 | 95 blocks + 9 已观察模板；3 模板公开源码，101 需 Pro |
| React Bits Free | 166 | 免费仓库能力完整，四种代码变体去重 | 全部公开源码 |
| React Bits Pro | 702 | 公开 Pro 文档索引完整 | 购买授权后源码 |
| tweakcn | 42 | 官方 defaultPresets 完整 | 全部公开；动态社区主题不宣称固定全量 |

合计：**3,753 public-source + 67 public-metadata-only + 2,176 paid-source-after-license = 5,996**。目录快照不绑定本地路径；A 缓存是否命中以独立 `source-cache/manifest.json` overlay 为准。

## coss current 577 与 coss Origin 646 的区别

- **coss current 577**：现在 `coss.com/ui` 使用的 Registry，基于 Base UI 新架构；508 个 Particles 加 69 个基础/支持条目。新页面和细节组件默认先查它，文档、安装路径和后续维护也以它为主。
- **coss Origin 646**：同品牌官方仓库保留的旧版快照；599 个可复用组件/示例加 47 个支持资产。它不是 current 的“升级版”，而是 legacy 资产池；数量更大是因为历史示例口径更宽，不代表技术路径更新。
- **使用顺序**：current 能满足就用 current；只有 current 缺失、Origin 恰好有成熟公开实现时，才把 Origin 作为 MIT 来源补位并单独适配。两者都不能用同名文件直接覆盖 shadcn。

### 不要混算的数字

- shadcn 的 5,120 是 24 套 preset 的 variant records，不是 5,120 个不同组件；跨样式只有 216 个去重名称。
- ReUI 的 2,552 是 638 个图标概念 × 4 种样式；目录按 638 个图标概念计数。
- Magic UI Pro 的 104 是公开可复现下限，官网没有公开总 Registry，不能写成“Pro 全量 104”。
- tweakcn 社区主题持续增长且游标分页；42 只代表官方默认 presets。

## 会员、许可证和仍不可全拉的部分

- ReUI：518 Pro Blocks、638 Ultimate Icons、10 Ultimate Templates 共 1,166 条需合法 license key；公开 Registry 的 MIT 不能外推到付费源码。终验联网时官方 Registry 当天新增 20 个 Cascader 示例、24 个 Cascader/Filters 模块与 16 个 Pro Hero，已全部滚入当前快照。
- Aceternity：207 条 Pro；Pricing 写 200+ premium blocks，但公开 AI 索引只枚举 167 个付费 block leaf，需会员账户才能对齐产品包。
- Magic UI Pro：公开页面能证明至少 95 blocks、9+ templates，但没有公开总 manifest；当前 104 仅为 lower-bound。
- React Bits Pro：702 个公开候选名可查，源码仍受 Pro 获取和许可证约束。
- shadcn Registry Directory：另有 280 个第三方 provider 元数据，但每家内部数量、价格、登录和许可证必须逐库审计，不能混进第一方 473。
- 没有绕过登录、401、会员或商业许可证；付费目录只保存公开名称、预览、层级和官方获取入口。

## A 方案已经下载的非 shadcn 源码

| 来源 | 高频根资产 | 必要依赖 | 缓存条目 | 实际源码文件 |
|---|---:|---:|---:|---:|
| coss current | 12 | 32 | 44 | 44 |
| ReUI | 8 | 8 | 16 | 16 |
| Tremor | 7 | 0 | 7 | 7 |
| Aceternity | 6 | 1 | 7 | 7 |
| Magic UI Free | 7 | 0 | 7 | 7 |
| React Bits Free | 7 | 0 | 7 | 11 |
| tweakcn | 1 | 0 | 1 | 1 |
| **合计** | **48** | **41** | **89** | **93** |

准确表达：这些是从官方 Registry/GitHub raw 保存的**隔离源码缓存**，带官方 URL、访问状态、许可证范围和 hash；可以让前端 Agent 直接 inspect、比较并复制。93 是磁盘物理缓存文件数；Registry JSON 内嵌的源码 module 合计 103，展厅分两列显示，避免混算。它们尚未安装进 `apps/web` 运行时，也没有替老板选定某一组件。

## 2,176 条付费元数据的合法免费替代

`free-alternatives.json` 已核对 ReUI 1,166、React Bits Pro 702、Aceternity 207、Magic UI Pro 101，共 **2,176 条已知付费元数据**。其中 Aceternity 有 23 条只是分类节点，不是具体资产；真正逐项映射的是 **2,153/2,153 个具体付费能力**。经多轮语义紧缩后，只有 **272** 项标为“有同能力免费候选”，**638** 个 Ultimate 图标进入 Lucide/Tabler 语义选择，**1,237** 项必须用免费 primitives 重组，**6** 项要先复核 Free 条款；后两类共 **1,243** 项明确标为“没有足够证据宣称存在直接免费替身”。新增的 16 个 ReUI Pro Hero 全部保守标成组合层，不把视觉素材伪装成可直接替代。整个 discovery-only 组件库、只有视觉材料、泛 scheduling/social-proof 区块，或仅共享 `text/with/shader` 等宽泛词，都不再计入直接替代。每项提供 1–3 个处置方案：

1. 同品牌 Free 版本重新组合；
2. 同能力的 MIT/Apache/ISC 免费组件；
3. 已收录免费资产的组合；
4. 确无现成实现时，独立编写业务组合层，但不照抄付费源码和受保护设计。

首批新增公开源码候选为 Kibo UI（复杂 B 端组件）、Dice UI（Data Grid/File Upload 等无障碍交互）、Animate UI（克制的 shadcn 动效）、Motion Primitives（精细微交互）、Vercel AI Elements（AI/Agent 界面）。它们目前只进入 discovery，尚未全量收录或缓存。Animate UI 实际为 **MIT + Commons Clause**，可放进应用，但不能直接销售或再分发组件本身。

## 离线 HTML 展厅

仓库内 `docs/frontend/ui-assets/showroom.html` 可直接查看；页面把数据、样式和脚本全部内嵌，不依赖 CDN 或联网。包括：

- 12 条产品线的风格、维护状态、Free/Pro/Ultimate 边界；ReUI 另显示 Base/Radix × 8 styles＝16 个 Registry variants 与 4 种 icon styles；
- 5,996 条目录的来源/能力/访问层级筛选与分页；
- 2,176 条付费元数据、23 条分类节点与 2,153 个具体能力的分级替代/组合策略；
- 89 个已缓存源码条目与本地路径；
- 42 个 tweakcn 官方主题的真实色板；
- 5 个新开源候选的定位、许可证和官方入口。

## 风格与使用定位

| 来源 | 风格/擅长 | 本项目定位 |
|---|---|---|
| shadcn | 克制、成熟、B 端结构稳定 | 页面壳、导航、表单和基础组件主路径 |
| coss/ui | 极简现代、细节完成度高，基于 Base UI | 日期/范围、Command、组合框、字段组、对话框、抽屉、按钮组、空态等细节组件优先查 |
| ReUI | 数据密集、后台感强、复杂交互完整 | Data Grid、筛选、列配置、应用壳；先区分 Free/Pro |
| Tremor | 数据分析、图表、Dashboard Blocks | 指标卡、图表、分析块和报表页面候选 |
| Aceternity | 高质感动效、展示型页面 | 登录、欢迎、重点空态或展示区适量使用，不铺满后台 |
| Magic UI | Bento、营销感、轻动效 | 概览亮点、说明区、品牌化模块 |
| React Bits | 动效更强、创意感明显 | 偶尔用于关键状态或展示，不作为全站基础层 |
| tweakcn | shadcn token/theme 配置体系 | **多风格运行时切换的重点基础**；42 个官方 preset 已保存完整 token 源 |

共存规则：shadcn/Radix 保持 `components/ui/` 基础路径；coss/Base UI 放独立目录并显式导入。两者可以在同一 React/Next.js 页面组合使用，但禁止同名覆盖、偷偷替换 primitive 或无边界混装。

## 存储格式与权威文件

仓库根：`/Users/aik/Desktop/投放agent`

- 总入口：`docs/frontend/ui-assets/README.md`
- 12 份逐库 JSON：`docs/frontend/ui-assets/catalogs/*.json`
- JSON schema：`docs/frontend/ui-assets/catalog.schema.json`
- 跨来源能力索引：`docs/frontend/ui-assets/capabilities.json`
- 覆盖、会员与未知缺口：`docs/frontend/ui-assets/coverage-audit.json`、`coverage-audit.md`
- 本地源码状态：`docs/frontend/ui-assets/source-download-manifest.json`、`source-download-status.md`
- A 方案高频清单：`docs/frontend/ui-assets/starter-pack.json`
- A 方案缓存与源码：`docs/frontend/ui-assets/source-cache/manifest.json`、`source-cache/<source>/...`
- 付费能力免费替代：`docs/frontend/ui-assets/free-alternatives.json`、`free-alternatives.md`
- 新开源候选：`docs/frontend/ui-assets/discovery.json`、`discovery.md`
- 离线可视化：`docs/frontend/ui-assets/showroom.html`、`showroom-data.json`
- 安装、修改、主题、许可证规范：`docs/frontend/ui-assets/guides/*.md`、`licenses.md`
- 三路独立审查与主 Agent 复核：`docs/frontend/ui-assets/reviews/2026-08-19-independent-audit.md`
- 代码质量复核：`docs/frontend/ui-assets/reviews/2026-08-19-code-quality.md`
- 格式说明：`docs/frontend/ui-assets/storage-format.md`

每条目录至少记录：来源、逻辑名称、类型/分类、真实预览、源码或安装入口、底层、依赖、许可证、访问层级、认证要求、维护状态、上游 ref、核验日期、本地状态和原始 upstream metadata。目录项与源码缓存用不同字段表达，禁止根据 `catalogued` 推断“已下载”。

## 前端 Agent 正确工作流

1. 先查 `capabilities.json`，不要凭记忆手写已有组件。
2. 同一能力命中多个来源时，打开真实预览，在同一业务位置并排展示；说明底层、依赖、许可证、适配成本和推荐理由，交老板拍板。
3. 先查 A 缓存；命中就 inspect 已校验 payload，未命中再从官方 item/仓库按需获取。
4. 付费项必须先有合法授权；未购买时查逐项免费替代，不绕会员。
5. 只复制已选组件及必要依赖，按来源隔离目录；业务数据映射、token 适配和必要组合层可以写，已有通用组件不重复造。
6. 安装到运行仓时登记官方 URL、variant、HTTP/访问状态、SHA-256、本地路径和修改说明；没有 exact ref/hash 只能标 inferred。
7. 最后跑 typecheck/lint/test、桌面与移动端截图、交互、dark mode 和可访问性检查。

常用命令：

```bash
node apps/web/scripts/ui-catalog/build-capability-index.mjs --query date-picker --limit 30
node apps/web/scripts/ui-catalog/build-capability-index.mjs --query date-picker --source coss --limit 20
node apps/web/scripts/ui-catalog/sync.mjs --check
node apps/web/scripts/ui-catalog/build-capability-index.mjs --check
node apps/web/scripts/ui-catalog/build-coverage-audit.mjs --check
node apps/web/scripts/ui-catalog/audit-runtime-source.mjs --check
node apps/web/scripts/ui-catalog/cache-starter-sources.mjs --check
node apps/web/scripts/ui-catalog/build-free-alternatives.mjs --check
node apps/web/scripts/ui-catalog/build-showroom.mjs --check
node --test apps/web/scripts/ui-catalog/*.test.mjs
```

## 下次从这里继续

- 先用 `showroom.html` 按真实需求筛选；同一能力有多个候选时做同容器并排样板，再由老板选择。
- F-001 运行时页面交接干净后，从 A 缓存把已选源码接入来源隔离目录，避免覆盖当前前端 Agent 的改动。
- 第一组真实选型建议从日期范围选择器开始：coss `p-date-picker-2`、shadcn range、ReUI 带预设方案在同一筛选栏做并排样板。
- 同时建立 tweakcn 主题切换 PoC：先从 42 个官方 presets 挑 3–5 套差异明显但适合 B 端的风格，验证 light/dark、图表 token、密度与持久化。
- 每接入一个来源，就更新运行时 `source-download-manifest.json`；A 缓存 manifest 与运行时 manifest 不混用。不要为了“看起来全量”镜像未购买的付费包。
- 刷新目录前先看 item-count 倒退拦截；数量下降必须人工确认是上游删除还是解析器漏抓。

## 官方入口

- [shadcn Registry](https://ui.shadcn.com/r/index.json)
- [coss/ui Registry](https://coss.com/ui/r/registry.json)
- [ReUI 全量索引](https://reui.io/llms.txt)
- [Tremor Blocks](https://blocks.tremor.so/blocks)
- [Aceternity AI index](https://ui.aceternity.com/ai-recommendations)
- [Magic UI Registry](https://magicui.design/r/registry.json)
- [React Bits](https://reactbits.dev/)
- [tweakcn Community](https://tweakcn.com/community)
