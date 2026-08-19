# 官方 UI 资产源

> 最后人工核验：2026-08-19  
> 机器连通状态见 `source-health.json`

## 状态含义

- `verified`：当前被检查的官方入口可读取；覆盖范围仍以 catalog 的具体 coverage 字段为准。
- `partial`：公开目录只能给出下限、动态集合或需要多个入口归并；不把它伪装成品牌全量。
- `blocked`：官方入口不可用；保留上次成功快照并停止自动覆盖。

## 来源总表

| 来源 | 能力入口 | 目录方式 | 许可证/边界 | 当前覆盖策略 |
|---|---|---|---|---|
| shadcn/ui | [Components](https://ui.shadcn.com/docs/components)、[Blocks](https://ui.shadcn.com/blocks) | New York v4 Registry + logical/config indexes | 第一方 MIT；Directory/Figma 第三方另核 | 473 logical items；24 preset variants 另存矩阵 |
| coss/ui | [Components](https://coss.com/ui)、[Particles](https://coss.com/ui/particles) | [官方 Registry](https://coss.com/ui/r/registry.json) | `apps/ui` MIT；仓库其他目录默认 AGPL | current 577 全收 |
| coss Origin | [Legacy snapshot](https://coss.com/origin) | Git tree + category map + public item JSON | `apps/origin` MIT | legacy 646 单独记录，maintenance-stale |
| ReUI | [Components](https://reui.io/components)、[llms index](https://reui.io/llms.txt) | Registry + llms + 30 icon pages | Free MIT；Pro/Ultimate 商业许可 | 2,255 logical items；16 variants 另存矩阵 |
| Tremor current | [Blocks](https://blocks.tremor.so/blocks) | Raw + Blocks 树 + Templates | Apache-2.0 / MIT（按子项目） | 375 items |
| Tremor legacy | [旧 npm docs](https://npm.tremor.so/docs/getting-started/installation) | sitemap | Apache-2.0 | 30 still-live capabilities，maintenance-stale |
| Aceternity | [AI 完整目录](https://ui.aceternity.com/ai-recommendations) | 官方 machine-readable 页面 | per-item / Pro 自有许可证 | free/pro/templates/blocks/hooks 分栏 |
| Magic UI Free | [Components](https://magicui.design/docs/components) | [官方 Registry](https://magicui.design/r/registry.json) | MIT | 247 全收 |
| Magic UI Pro | [Pro docs](https://pro.magicui.design/) | 12 section pages + sitemap | 商业许可；3 个公开模板逐仓核验 | 104 是可复现下限，不宣称品牌全量 |
| React Bits Free | [Free catalog](https://reactbits.dev/) | 官方仓库 content/code 树 | MIT + Commons Clause | 166 logical items，四代码变体归一 |
| React Bits Pro | [Pro catalog](https://pro.reactbits.dev/) | 官方 sitemap | 商业许可 | 702 public names，源码需 license key |
| tweakcn | [Theme editor](https://tweakcn.com/editor/theme) | 官方仓库 preset/config + share 数据 | Apache-2.0 | 主题 token 与 editor 版本一起记录 |

## 已核实的安装地址

### shadcn

```bash
npx shadcn@latest view <item> --cwd apps/web
npx shadcn@latest add <item> --cwd apps/web
```

官方 shadcn item 使用裸名；第三方 Registry 使用命名空间或完整 URL。

### coss

```bash
npx shadcn@latest view @coss/calendar --cwd apps/web
npx shadcn@latest add @coss/calendar --cwd apps/web
```

命名空间解析到 `https://coss.com/ui/r/{name}.json`。Date Picker 是 Calendar + Popover + Button 的组合，不存在 `@coss/date-picker` 独立 item。

### ReUI

```json
{
  "@reui": "https://reui.io/r/{style}/{name}.json"
}
```

示例：`npx shadcn@latest add @reui/c-data-grid-9 --cwd apps/web`。Free 可公开 view；Pro/Ultimate 需要合法 `REUI_LICENSE_KEY`，不得绕过 401。

### Aceternity

```json
{
  "@aceternity": "https://ui.aceternity.com/registry/{name}.json"
}
```

先 `view @aceternity/<name>`，再按需 `add`。Pro 只登记目录和许可状态，不保存/再分发未授权源码。

## 不纳入“官方全量”的内容

- 第三方搬运站、非官方 fork 和仅靠博客整理的组件名；
- 无法确认来源/许可证的截图与代码片段；
- 付费源码在未购买或不允许再分发时的本地镜像；
- GitHub 星数、营销文案等不能替代官方 Registry/仓库事实的指标。
