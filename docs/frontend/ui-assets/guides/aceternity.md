# Aceternity UI 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/aceternity.json`（319 项，Free/Pro 分栏）  
> 定位：Bento、背景、高识别卡片与克制的高级动效

## 安装与获取

官方命名空间：

```json
{
  "registries": {
    "@aceternity": "https://ui.aceternity.com/registry/{name}.json"
  }
}
```

```bash
npx shadcn@latest list @aceternity
npx shadcn@latest search @aceternity -q "card"
npx shadcn@latest view @aceternity/bento-grid --cwd apps/web
npx shadcn@latest add @aceternity/bento-grid --cwd apps/web
```

免费 item 可由 Registry inspect/add；Pro blocks/templates 必须通过已购买的官方渠道获取，目录中的 `Available with Pro license` 不是可下载命令。

当前 AI Index 精确拆分为 111 Free Components + 1 free hook + 23 Pro 分类入口 + 167 Pro leaf blocks + 17 Templates＝319。23 个分类入口不能宣传成 23 个可安装 block。Pricing 的“200+ premium blocks”与公开 Index 的 167 个 leaf blocks 未消解，因此本目录是“完整到 AI Index”，不是对付费下载包的无条件全量声明。

## 使用与组合

- 官方 AI catalog 给出组件名、类别、依赖、安装命令和 Free/Pro 状态；前端 Agent 先查它，不靠旧博客名单。
- 多数组件基于 React/Next.js、Tailwind 和 Motion；一部分还有 tsparticles、three.js 等重依赖，必须先看 item dependencies。
- 主后台只在工作台摘要、空态、Agent/值守或特定高识别模块使用；高频表格区不堆持续动画。

## 修改与适配

Aceternity Pro 许可明确允许在 end product 中修改、组合和制作 derivative work。项目适配要求：

1. 改为项目 token、中文、响应式和 dark/light；
2. 动画提供 `prefers-reduced-motion`/关闭路径；
3. canvas/3D/particles 按需动态加载并测主线程/显存；
4. 保留可访问文本和操作路径，装饰层 `aria-hidden`；
5. 不把购买的 Pro 源码整理成可对外分发的组件库。

## 许可证

- Pro：可用于无限 end products、可修改；禁止把 Item/source files 作为库存、模板、组件库或 marketplace 商品再分发。
- Free：官方 Registry 表示可安装使用，但网站 Terms 与 per-item/第三方条款可能不同；复制前按 item 核验，不能自动标成 MIT。
- 第三方依赖/素材按各自许可证执行。

## 更新与变更

官方提供 Changelog 和 AI catalog。刷新时比较 Free/Pro 状态、依赖和 install command；Motion/Next/Tailwind major 变化需重新测 SSR、hydration、reduced-motion 和移动端性能。

## 官方来源

- Components：<https://ui.aceternity.com/components>
- 完整 AI catalog：<https://ui.aceternity.com/ai-recommendations>
- CLI/Registry：<https://ui.aceternity.com/docs/cli>
- Changelog：<https://ui.aceternity.com/changelog>
- Licence：<https://ui.aceternity.com/licence>
- Terms：<https://ui.aceternity.com/terms>
- Pricing/Free-Pro 边界：<https://ui.aceternity.com/pricing>
