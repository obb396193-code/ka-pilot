# Web 前端 UI 资产规则

本目录继承仓库根 `AGENTS.md`，并追加以下前端规则。产品契约、写操作确认和数据脱敏红线仍以根规则为准。

## 开工前必读

- [UI 资产总入口](../../docs/frontend/ui-assets/README.md)
- [前端 Agent 工作流](../../docs/frontend/ui-assets/agent-workflow.md)
- [多来源对比模板](../../docs/frontend/ui-assets/comparison-template.md)

## 强制规则

1. **先查目录**：新增页面、组件或交互前，先按能力词查完整目录和已批准资产；不能只凭会话记忆判断“没有现成的”。
2. **优先官方源码**：官方已有合适 Block、Component、Particle 或模板时，复制并持有官方源码，只自写业务数据/权限/状态适配和必要组合。
3. **多候选对比**：同一能力首次进入项目且存在两个以上合格来源时，必须提交真实预览、底层、依赖、适配成本和许可证对比；老板拍板后登记 `preferred`，以后直接复用。
4. **来源隔离**：shadcn/Radix 保留在 `components/ui/`；coss/Base UI 放 `components/coss/`；ReUI、Blocks、Motion 分别进自己的来源目录。禁止同名覆盖。
5. **保留行为契约**：可以改 token、密度、中文、响应式和业务 props；不要随意改焦点、键盘、ARIA、portal、受控状态等底层行为。
6. **可追溯**：源码进入仓库时登记官方 URL、上游 ref、许可证、安装命令、本地路径和修改说明。
7. **先检验再交付**：至少通过 lint、build、多主题、键盘、空/错/加载/禁用、桌面/移动端和 overlay 层级检查。

## 当前优先级

- 页面壳与基础结构：shadcn/ui + Blocks
- 细节组件：coss/ui Components + Particles
- 复杂数据：ReUI
- KPI/经营看板：Tremor Blocks
- 高级视觉/动效：Aceternity、Magic UI、React Bits
- 多风格：tweakcn token；组件禁止硬编码某个 preset
- 业务图表：ECharts，颜色从同一主题 token bridge 获取

## 冲突处理

如果 CLI 想覆盖现有文件、许可证不明确、官方来源失效、或需要大改底层行为，停止写入，先在对比/决策记录中说明，不自行绕过。

