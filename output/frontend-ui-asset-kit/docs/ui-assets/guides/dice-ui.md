# Dice UI 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/dice-ui.json`（242）  
> 定位：Data Grid、File Upload、Kanban、Cropper、Tags Input 等复杂交互补充

## 安装与获取

当前公开 Registry 是 Radix 分发，包含 44 UI、184 examples、8 internal components、4 hooks 和 2 libs：

```bash
npx shadcn@latest view https://diceui.com/r/data-grid.json --cwd apps/web
npx shadcn@latest add https://diceui.com/r/data-grid.json --cwd apps/web
```

Base/Radix × Nova/Vega 是实现/风格变体，不重复计成四套逻辑资产。接入本项目时先用当前 Radix Registry；若改 Base variant，必须单独做 API 和焦点回归。

## 使用与组合

- Data Grid 首次使用时必须与 ReUI、coss、TanStack Table 在同一脱敏数据容器中比较列配置、虚拟滚动、选择、编辑和键盘成本。
- File Upload 只承担前端交互；真实鉴权、分片、重试、病毒扫描和服务端状态由上传 adapter 负责。
- Kanban/Cropper/Tags Input 优先复用官方 component，再按业务补薄封装，不复制 example 中的 demo 数据流。

## 修改与适配

1. 样式改为项目语义 token；保留 Radix 的 aria、focus、portal 和受控/非受控边界。
2. Data Grid 对齐 W3C Grid 键盘模型，并测万级数据、列宽、固定列、中文长文本和空/错/加载态。
3. Upload 测文件类型/大小、重复、取消、失败重试和移动端选择。
4. dnd-kit 类组件补无鼠标操作与保存冲突反馈。
5. 每次只迁入实际依赖，记录 Registry URL、ref、hash 和适配 diff。

## 许可证

官方仓库为 MIT。

## 更新与变更

更新按单项 Registry 和 changelog 比较；复杂交互组件不得只做视觉截图回归，还要跑键盘、焦点、读屏语义和数据状态测试。

## 官方来源

- Introduction：<https://diceui.com/docs/introduction>
- Components：<https://diceui.com/docs/components>
- Changelog：<https://diceui.com/docs/changelog>
- Registry：<https://diceui.com/r/registry.json>
- Repository / License：<https://github.com/sadmann7/diceui>
