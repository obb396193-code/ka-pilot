# ReUI 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/reui.json`（2,315 个逻辑资产）
> 定位：复杂数据工作台、Data Grid、Filters、Kanban/Gantt/Event Calendar

## 安装与获取

ReUI 使用 shadcn Registry，`c-*` 是可复制的 example/pattern：

```json
{
  "registries": {
    "@reui": "https://reui.io/r/{style}/{name}.json"
  }
}
```

```bash
npx shadcn@latest view @reui/c-data-grid-9 --cwd apps/web
npx shadcn@latest add @reui/c-data-grid-9 --cwd apps/web
```

免费层为 1,052 个 `c-*` examples、49 个 Registry UI modules 和 4 hooks；可直接 view/add。502 个 Pro Blocks 需要 `REUI_LICENSE_KEY`，638 Icons 和 10 Templates 需要 Ultimate。未授权 Pro item 实测返回 401，这是许可边界，不得从第三方镜像绕过。

具体源码 endpoint 是 `https://reui.io/r/{style}/{name}.json`。当前有 Base/Radix × 8 styles＝16 个 concrete variants；目录以 base-nova 作为逻辑快照，使用时必须选定并记录 variant。

## 使用与组合

- ReUI 官方主张 browse → copy → customize → own，适合按需复制，而非把 1000+ patterns 全装入运行仓。
- 复杂组件使用 TanStack Table、dnd-kit、Recharts、React Hook Form、Zod 等成熟依赖；引入前按 item 查看真实 dependency graph。
- ReUI 2.0 同时考虑 shadcn 与不同底层 style；目录快照当前来自 `base-nova`，项目选具体 item 时要比较 Base/Radix 变体。
- 638 icons 各有 duotone/filled/outline/solid 四种 style（2,552 渲染变体），按 icon 概念选型后只下载需要的一种。
- 数据页优先从 Data Grid/Filters 的成组变体里选行为最接近的一项，不在基础 Table 上重新手写列固定、列配置、过滤或虚拟滚动。

## 修改与适配

允许通过 Tailwind token 和源码修改视觉/组合。项目适配要求：

1. 先确认 React 19、Tailwind v4 与当前 item/style 的兼容性；官方 README 的最低要求不能替代实测。
2. 复用当前项目已有 TanStack Table/dnd-kit 版本，避免同功能双依赖。
3. 数据 schema、列定义、权限、服务端分页和 loading/empty/error 放业务 adapter。
4. 虚拟滚动、拖拽、键盘、ARIA、列宽状态属于底层行为，除修 bug 外不随意改写。
5. 只复制选中的 pattern 与依赖 primitives，放 `components/reui/`。

## 许可证

免费公开 Registry/仓库源码为 MIT。518 Pro Blocks、638 Icons、10 Templates 不属于 MIT，适用 ReUI 商业许可：可在许可范围内修改并用于 end product，禁止公开仓库、镜像 Registry、再分发或转售源码。客户后续开发还可能需要独立席位；交付前按官方条款核对。

## 更新与变更

ReUI 目录由 `registry-reui/` 和 build scripts 生成。更新时查看官方仓库 commits/issues、重新运行 item view，对比当前 style 与 vendored 文件；Data Grid/Filters 必须回归类型、排序/过滤、分页、虚拟化、拖拽和大数据性能。

## 官方来源

- Components：<https://reui.io/components>
- Docs：<https://reui.io/docs>
- Repository：<https://github.com/keenthemes/reui>
- README/Registry 机制：<https://github.com/keenthemes/reui/blob/main/README.md>
- Registry source：<https://github.com/keenthemes/reui/tree/main/registry-reui>
- 官方全量索引：<https://reui.io/llms.txt>
- Pricing：<https://reui.io/pricing>
- License setup：<https://reui.io/docs/license-setup>
- Free repository license：<https://github.com/keenthemes/reui/blob/main/LICENSE>
- Commercial license：<https://reui.io/legal/license>
- Issues/changes：<https://github.com/keenthemes/reui/issues>
