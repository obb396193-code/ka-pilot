# 投放 Agent 双布局真实前端 Demo

这是独立可运行的视觉样机，不修改或导入 Claude 尚未完成的 `apps/web` 页面。

- `sidebar.html`：直接复用 shadcn dashboard-01 安装中的官方 `sidebar.tsx` primitives，并使用官方 `new-york-v4` neutral/OKLCH 主题 token；项目只映射投放业务菜单和内容。
- `topbar.html`：成熟 Navigation Menu 顶栏结构。
- 两个入口不存在互相跳转或布局切换按钮。
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
