# COSS 产品顶栏对比版验收

> 验收日期：2026-08-21
>
> 入口：`http://127.0.0.1:5173/topbar-coss.html`
>
> 范围：独立比较 Demo，未接入正式 `apps/web`

## 1. 官方源码与边界

- 使用 shadcn CLI 从 COSS current 官方 Registry 机械安装 Button、Card、Badge、Avatar、Input、Table、Spinner 和 segmented-control。
- 8 个官方文件保存在 `src/topbar-coss/coss-ui/`，只由 CLI 改写项目 import alias；合并本地 SHA-256 为 `dbe0d1cc7afcc3d0515104c35b0854d7a7437a75747a83fcf8826165593c5a22`。
- 运行时底层为 `@base-ui/react 1.7.0`，字体为 `@fontsource-variable/inter 5.3.0`。
- CSS 使用 COSS `style.json / colors-neutral.json` 官方 neutral 变量语义，包括 0.625rem radius、primary/secondary/muted、success/warning/info 和 Base UI focus ring。
- 未复制许可证未单独声明的 Atlas CRM 整页源码；顶栏产品化密度只作视觉参考，运行组件均来自可核验 COSS UI Registry。

## 2. 业务口径

- KPI：今日消耗、真实 CPA、达标率、待处理。
- 趋势：消耗面积 + 真实 CPA 折线，不出现“支付”或 ROI。
- 任务表：AAC 拉新、`newaac_uv_attrib_install`、`wake_uv`、`aac_ptt_uv`、24h 零消耗、`main_ad_cost_proportion`。
- 所有任务、金额、数值和账号信息都是脱敏演示数据。

## 3. 真实浏览器验收

- 实测视口：1440×812，`scrollWidth = clientWidth = 1440`，无横向溢出。
- 实测样式：7 个 COSS `data-slot=card`，1 个 COSS `data-slot=table`；body 计算字体为 `Inter Variable, PingFang SC, Microsoft YaHei`。
- 已实测：快手优化师 / KA 负责人视图切换、COSS segmented navigation、更多菜单、任务搜索实时筛选、投放 Agent 右抽屉、头像账号菜单。
- COSS 页面 console：0 error / 0 warning。
- shadcn A 版与侧栏版回归：两个入口均 1440px 无溢出，console 0/0。

## 4. 工程门禁

- COSS Vitest：2/2 通过。
- Node 全套入口/来源/隔离测试：9/9 通过。
- COSS 独立 TypeScript 配置 `tsconfig.coss.json`：通过。
- 本范围 Prettier 与 `git diff --check`：通过。
- Vite production build：成功生成 `sidebar.html / topbar.html / topbar-coss.html`。
- `npm audit`：0 vulnerabilities。
- 共享 Recharts chunk 仍 >500kB，属已知 P2 路由拆包优化，不影响本次布局比较。
- 全局 `tsc -b` 仍会被范围外未完成 `kpi-component-demo` 缺模块阻断；本次使用独立 COSS tsconfig 完成同范围严格类型验收，未越界修改该 Demo。

## 5. 结论

COSS 版已可侜为独立完整的产品风顶栏比较页。与 shadcn A 版相比，它使用更大圆角、弱阴影、更紧凑 Badge/Table 和分段导航；两版共享脱敏数据，但不共享 UI 组件或入口 CSS。
