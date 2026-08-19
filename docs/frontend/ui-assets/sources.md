# 官方 UI 资产源

> 最后人工核验：2026-08-19  
> 机器连通状态见 `source-health.json`

## 状态含义

- `verified`：官方提供可直接读取的完整 Registry 或机器目录，且当前连通。
- `partial`：官方入口连通，但需要从仓库树/多个入口归并，或只覆盖一个 style；不把它伪装成已完整同步。
- `blocked`：官方入口不可用；保留上次成功快照并停止自动覆盖。

## 来源总表

| 来源 | 能力入口 | 目录方式 | 许可证/边界 | 当前覆盖策略 |
|---|---|---|---|---|
| shadcn/ui | [Components](https://ui.shadcn.com/docs/components)、[Blocks](https://ui.shadcn.com/blocks) | 官方仓库树 + CLI Registry | MIT | 归并 v4 components/examples/blocks/styles |
| coss/ui | [Components](https://coss.com/ui)、[Particles](https://coss.com/ui/particles) | [官方 Registry](https://coss.com/ui/r/registry.json) | `apps/ui` MIT；仓库其他目录默认 AGPL | Registry 全收，复制前核文件路径 |
| ReUI | [Components](https://reui.io/components) | 线上 Registry + 官方仓库树 | MIT | Registry 当前 style + 仓库全部 styles/examples |
| Tremor | [Blocks](https://www.tremor.so/blocks) | `tremor` + `tremor-blocks` 官方仓库树 | Apache-2.0 / MIT（按子项目） | 组件、Blocks、模板分开记录 |
| Aceternity | [AI 完整目录](https://ui.aceternity.com/ai-recommendations) | 官方 machine-readable 页面 | per-item / Pro 自有许可证 | free/pro/templates/blocks/hooks 分栏 |
| Magic UI | [Components](https://magicui.design/docs/components) | [官方 Registry](https://magicui.design/r/registry.json) | MIT | Registry 全收 |
| React Bits | [Free catalog](https://reactbits.dev/) | 官方仓库 content/code 树 | MIT + Commons Clause；Pro 独立 | 四代码变体归一，Free/Pro 分开 |
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

示例：`npx shadcn@latest add @reui/c-data-grid-9`。当前线上 Registry 的 style 路由曾有公开故障记录，实际加入前必须先 `view`。

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

