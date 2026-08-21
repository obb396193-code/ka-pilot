# 投放 Agent 双布局真实前端 Demo

这是独立可运行的视觉样机，不修改或导入 Claude 尚未完成的 `apps/web` 页面。

- `sidebar.html`：整块复用 shadcn `new-york-v4/dashboard-01` 官方 Registry：AppSidebar、导航、SiteHeader、SectionCards、Recharts AreaChart、可拖拽 DataTable、详情 Drawer 及其 UI primitives；入口独占官方 globals/Tailwind 扩展、实页主题 token 和 Geist 字体，只替换投放业务文案和脱敏示例数据。
- `topbar.html`：整块复用 shadcn 官方历史版完整顶栏 Dashboard：TeamSwitcher、MainNav、Search、UserNav、日期范围、KPI Cards、Recharts Overview、Recent list 与 Tabs；入口独占 shadcn globals 和 Geist 字体，只替换中文投放文案、导航与脱敏示例数据。
- `topbar-coss.html`：COSS current 产品风独立对比版，实际复用 Base UI 版 Button、Card、Badge、Avatar、Input、Table 和 segmented navigation，使用官方 neutral token 与 Inter 字体。
- 三个入口不存在互相跳转或布局切换按钮。
- 页面业务记录均为脱敏演示数据。

## 运行

```bash
npm install
npm run dev
```

分别打开终端输出中的 `sidebar.html` 与 `topbar.html`。

默认开发地址：

- `http://127.0.0.1:5173/sidebar.html`
- `http://127.0.0.1:5173/topbar.html`

电脑端为本轮主要验收范围；移动端只保留基础可用适配。
