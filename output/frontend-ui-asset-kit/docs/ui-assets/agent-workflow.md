# 前端 Agent：UI 资产工作流

## 1. 接到页面或组件需求

先读 `frontend-product-standard.md`，明确页面决策层级、指标/数据契约、状态矩阵和 Definition of Done。

先把需求拆成能力词，不要先写 JSX。例如账户筛选条可拆为：日期范围、账户多选、状态筛选、保存视图、清空条件、移动端收纳。

逐个能力查：

1. `capabilities.json` 是否已有跨库候选；
2. 是否存在已拍板的 `preferred`；
3. 官方 preview 是否真实覆盖所需交互；
4. `access_status` 是公开源码、仅元数据还是购买后源码；
5. guide 是否指出迁移、主题、portal、许可证或性能限制。
6. `source-cache/manifest.json` 是否已经缓存该官方 payload；命中时优先复用已校验版本。

常用命令：

```bash
# 查一个统一能力族（默认最多返回 50 个候选）
node apps/web/scripts/ui-catalog/build-capability-index.mjs --query date-picker

# 只看某个官方来源
node apps/web/scripts/ui-catalog/build-capability-index.mjs --query date-picker --source coss --limit 20

# 名称、描述、官方分类也可直接搜索
node apps/web/scripts/ui-catalog/build-capability-index.mjs --query virtualization

# 校验 A 方案高频源码缓存的所有 hash
node apps/web/scripts/ui-catalog/cache-starter-sources.mjs --check
```

## 2. 选择路径

### 已有首选资产

场景相同就复用。只需说明使用哪项、本地路径和本次业务适配，不重复请求老板选择。

### 多个合格候选，尚未拍板

按 `comparison-template.md` 输出对比。必须使用官方真实预览/截图，不能用自己画的示意代替。进入终选的候选还要放进同一个真实业务容器，用相同主题、宽度、中文和状态截图并排展示，避免官网版式差异干扰判断。老板选择后在 `decisions/<capability>.md` 留痕并把目录状态改为 `preferred`。

### 官方都没有

记录搜索范围和不适合原因，再查 `discovery.json`，然后提出三种选择：组合现有资产、引入新官方来源、或确有必要时本地实现。不得只写一句“没有”。

当前新来源使用策略：AI Elements、Kibo、Dice 已获老板准入，可进入具体能力选型；Animate UI、Motion Primitives 只能做少量微动效候选。它们在全量目录抓取完成前仍保持 `discovery-only/not-cached/not-installed`，不得把“获准选择”汇报成“已安装”。

### 命中付费能力但当前未购买

查 `free-alternatives.json` 中该 `paid_asset_id` 的 1–3 个候选，并在 HTML 展厅“付费处置”页打开比较。先读 `resolution_status/match_level/confidence/review_status/license_verified`：只有 `free-candidate-found` 才表示存在同能力候选；`composition-required` 只是 primitives/布局/视觉材料，必须重组；`license-check-required` 在条款确认前不得复制；图标库只按语义选图，不宣称造型一比一。不得绕过账号/401/license key，不得从搬运站取得付费源码，也不得照抄受保护设计。

## 3. 源码获取

1. 只从目录登记的官方 Registry、仓库或 Code 面板获取。
2. 先读 `access_status/auth_requirement/access_tier`；401/会员墙必须先取得合法许可，不从搬运站补源码。
3. 先查 `source-cache/manifest.json`；命中时先 inspect 本地官方 payload/raw source，未命中再访问上游。
4. 先运行 view/inspect，不直接 add。
5. 核对生成文件、依赖、license、版本、variant 和是否覆盖现有文件。
6. 在干净 worktree/分支运行 CLI；第三方默认输出路径不等于项目最终路径。
7. 按来源移动文件并修正内部 import。
8. 在运行时 manifest 登记：来源 URL、精确 ref/SHA-256、安装命令、复制日期、许可证、本地路径和修改。

## 4. 修改与适配

推荐改动：

- 项目语义 token、字体、圆角、阴影和密度；
- 中文文案、时区、业务日、数字/货币格式；
- controlled props、加载/空/错/禁用/只读；
- 响应式、ECharts token bridge、埋点和业务数据映射。

谨慎改动：

- 焦点圈和焦点回收；
- 键盘导航与 Esc/外部点击关闭；
- ARIA 标签/关系；
- portal、z-index/stacking context；
- 受控/非受控状态与事件顺序；
- 虚拟滚动、拖拽和无障碍传感器。

业务差异放 `components/business/` 薄适配，避免把 vendored 组件改成只服务一个页面。

## 5. 验证

交付前至少检查：

- TypeScript、ESLint、production build；
- light/dark 和全部已发布 preset；
- 键盘、focus、reduced motion；
- loading/empty/error/disabled/readonly；
- 1366px、1440px、移动端；
- Radix 与 Base UI overlays 同页时层级正常；
- 大表/长列表/频繁筛选的性能；
- 来源、许可证和修改记录可追溯。

核心业务组件还必须进入 Storybook 或等价隔离页，覆盖 `loading/empty/partial/stale/error/no-permission/disabled`；P0 页面必须有 Playwright 桌面/移动截图回归和键盘/焦点路径。完整门禁见 `frontend-product-standard.md`。

## 6. 交付说明

只报告已核实的状态：

- “已收录”＝目录有元数据；
- “已批准”＝老板选过；
- “已复制”＝源码进入运行仓；
- “已适配”＝业务封装和验证完成；
- “源码已缓存”＝官方 payload 有本地 path + exact hash；
- “已在 A 缓存”＝只存在 `docs/frontend/ui-assets/source-cache/`，不参与应用编译；
- “已安装”＝已从缓存或官方源复制到运行仓、依赖就绪且有运行时 manifest；
- “官方有”不等于“项目已经有”。
