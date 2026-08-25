# Web 前端 UI 资产规则

本目录继承仓库根 `AGENTS.md`，并追加以下前端规则。产品契约、写操作确认和数据脱敏红线仍以根规则为准。

## 前端唯一实现线（2026-08-25 冻结）

- `apps/ui-layout-demo/sidebar.html` 是唯一视觉母版；正式运行时逐批迁入 `apps/web`，旧前端页面不得作为视觉来源或整体合并。
- 每批可见改动必须分别取得老板视觉签字和 root 功能签字；自动测试不能替代任一人工签字。
- 旧 API/BFF/schema/adapter/权限/状态/测试只有经 root 标记 canonical 后才可逐文件复用。
- 复用 ContentRadar 时必须复制 ContentRadar 真实源码、样式、资源与依赖，记录原路径、commit 和修改清单；禁止看图仿写或接入已撤销小样。
- 官方或 ContentRadar 源码进入 `apps/web` 时，目标文件必须写 `SOURCE_IMPORT_ID`，并在 `docs/frontend/takeover/source-import-manifest.json` 登记完整 40 位上游 SHA、源/目标文件、依赖、授权边界和修改项；未登记不得进入运行时。
- 权威设计：[前端唯一实现线与视觉门禁](../../docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md)。

## 开工前必读

- [前端唯一实现线与视觉门禁设计](../../docs/plans/2026-08-25-前端唯一实现线与视觉门禁-design.md)
- [前端接管能力矩阵](../../docs/frontend/takeover/functional-capability-matrix.md)
- [前端交付总清单与未落地说明](../../docs/frontend/ui-assets/前端交付总清单与未落地说明.md)
- [UI 资产总入口](../../docs/frontend/ui-assets/README.md)
- [前端 Agent 工作流](../../docs/frontend/ui-assets/agent-workflow.md)
- [数据产品前端执行规范](../../docs/frontend/ui-assets/frontend-product-standard.md)
- [前端视觉与体验审核清单](../../docs/frontend/ui-assets/前端视觉与体验审核清单.md)
- [新来源准入与使用边界](../../docs/frontend/ui-assets/discovery.md)
- [F-004 前端 UI 资产与质量门禁](../../docs/relay/F-004-前端UI资产与质量门禁.md)
- [跨来源能力索引](../../docs/frontend/ui-assets/capabilities.json)
- [真实风格图册](../../docs/frontend/ui-assets/visual-guide.md)
- [已对比/已拍板记录](../../docs/frontend/ui-assets/decisions/README.md)
- [多来源对比模板](../../docs/frontend/ui-assets/comparison-template.md)

## 强制规则

1. **先查目录**：新增页面、组件或交互前，先按能力词查完整目录和已批准资产；不能只凭会话记忆判断“没有现成的”。
2. **优先官方源码**：官方已有合适 Block、Component、Particle 或模板时，复制并持有官方源码，只自写业务数据/权限/状态适配和必要组合。
3. **多候选对比**：同一能力首次进入项目且存在两个以上合格来源时，必须提交真实预览、底层、依赖、适配成本和许可证对比；进入终选的候选必须放进同一个真实业务容器、使用相同主题/尺寸/中文/状态截图，不能只拿不同官网版式做视觉结论。老板拍板后登记 `preferred`，以后直接复用。
4. **来源隔离**：shadcn/Radix 保留在 `components/ui/`；coss/Base UI 放 `components/coss/`；ReUI、Blocks、Motion 分别进自己的来源目录。禁止同名覆盖。
5. **保留行为契约**：可以改 token、密度、中文、响应式和业务 props；不要随意改焦点、键盘、ARIA、portal、受控状态等底层行为。
6. **可追溯**：源码进入仓库时登记官方 URL、上游 ref、许可证、安装命令、本地路径和修改说明。
7. **先检验再交付**：至少通过 lint、build、多主题、键盘、空/错/加载/禁用、桌面/移动端和 overlay 层级检查。
8. **访问边界**：目录候选先看 `access_status/access_tier/auth_requirement`；Pro/Ultimate/401 项必须先取得合法许可，禁止用第三方镜像补源码。
9. **目录不等于下载**：只有 `source-download-manifest.json` 中存在官方 URL、精确 ref/SHA-256 和本地路径，才能汇报“源码已下载/已适配”；`catalogued` 只表示 Agent 知道它存在。
10. **组件先行、状态齐全**：业务组件先在 Storybook 或等价隔离页覆盖正常/加载/空/错/过期/无权限/禁用状态，再进入页面；页面完成定义以 `frontend-product-standard.md` 为准。
11. **自动验收**：核心页面必须有桌面/移动视觉回归和键盘/焦点检查；图表、表格、弹窗和筛选器不得只凭鼠标主路径验收。
12. **交付即审核**：页面或批次完成后按 `前端视觉与体验审核清单.md` 生成审核报告；字体、间距、密度和动画是推荐基线，若真实页面不佳则调整语义 token 并留下跨页面/主题/视口证据，不机械固守参数。

## 当前优先级

- 页面壳与基础结构：shadcn/ui + Blocks
- 细节组件：coss/ui Components + Particles
- 复杂数据：ReUI、Dice UI；与 coss/TanStack 重叠时先同容器对比
- 复杂业务组件：Kibo UI（Gantt/Kanban/Editor/Dropzone/Calendar），颜色统一映射到项目 token
- KPI/经营看板：Tremor Blocks
- Agent 界面：Vercel AI Elements（悬浮入口/对话/消息/推理/工具/来源）
- 高级视觉/动效：Aceternity、Magic UI、React Bits
- 选择性微动效：Animate UI、Motion Primitives；每次对比、少量接入、支持 reduced motion
- 多风格：tweakcn token；组件禁止硬编码某个 preset
- 业务图表：ECharts，颜色从同一主题 token bridge 获取

## 冲突处理

如果 CLI 想覆盖现有文件、许可证不明确、官方来源失效、或需要大改底层行为，停止写入，先在对比/决策记录中说明，不自行绕过。
