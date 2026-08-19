# 五个新 UI 官方来源证据

> 核验日期：2026-08-19。只记录官方站点、官方 Registry 和官方 GitHub 仓库；官网营销数字不作为完整目录计数。

| 来源 | 权威目录 | 当日机械结果 | 覆盖边界 |
|---|---|---|---|
| Vercel AI Elements | `https://elements.ai-sdk.dev/api/registry/registry.json` | 136 条＝48 components + 88 examples | 部署 Registry 路由直接从官方 `packages/elements/src` 与 examples 生成；文档分组标题不另计资产 |
| Kibo UI | `https://www.kibo-ui.com/r/registry.json` + 官网服务端渲染的 `/blocks/` 链接 | Registry 41 条＝40 components + 1 style；另有 28 个官网 block 文档叶子 | block 页面声称可安装，但抽测 `/r/codebase.json`、`form.json`、`hero.json` 等返回 500，因此 block 只记 public-metadata-only；Shadcnblocks patterns 是另一产品，不混入 Kibo |
| Dice UI | `https://diceui.com/r/registry.json` | 242 条＝44 UI + 184 examples + 8 components + 4 hooks + 2 libs | 当前公开 manifest 是 Radix 分发；Base/Radix × Nova/Vega 作为 variant 边界，不把同一逻辑能力重复膨胀 |
| Animate UI | `https://animate-ui.com/r/registry.json` | 580 条＝573 UI + 5 hooks + 1 lib + 1 style | 包含 components、primitives、demos 和 icons 等可单独安装条目；许可证为 MIT + Commons Clause，应用可用但禁止组件本身转售/再分发 |
| Motion Primitives | 官方仓库 `public/c/registry.json` | 33 UI components | 官网 `/c/registry.json` 对自动客户端出现 429/403；官方仓库文件与站点构建源同源且可稳定复核，采用仓库 Registry |

## Firecrawl 官方 URL 映射

- AI Elements：74 个 URL；覆盖 components/docs/examples 入口。
- Kibo UI：69 个 URL；覆盖 40 个 component 页、block 页和 docs。
- Dice UI：110 个 URL；覆盖 Radix/Base component docs、utilities 和 changelog。
- Animate UI：71 个页面入口；Registry 另含大量 demo/icon install items，因此以 Registry 为机器目录权威。
- Motion Primitives：38 个 URL；覆盖 33 个组件文档、安装与首页。

## 源码与访问实测

- AI Elements：`/api/registry/registry.json`、`message.json`、`all.json` 均为公开 JSON；`all.json` 当日约 340KB。
- Kibo：component Registry 公开；抽测 block Registry endpoint 为 HTTP 500，不把文档页面误报成已取得源码。
- Dice、Animate：`/r/registry.json` 均公开 JSON。
- Motion：站点端点有限流，官方 GitHub raw Registry 公开；仓库 recursive tree `truncated=false`。

## 决策继承

- 正式准入：AI Elements、Kibo UI、Dice UI。
- 选择性准入：Animate UI、Motion Primitives。
- 本记录只证明目录与访问边界，不表示运行时已经安装。
