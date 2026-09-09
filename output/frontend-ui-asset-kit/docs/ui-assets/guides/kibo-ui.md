# Kibo UI 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/kibo-ui.json`（69）  
> 定位：Gantt、Kanban、Editor、Dropzone、Color Picker、复杂 Calendar 等业务级组件

## 安装与获取

当前 Registry 有 40 个可取源码组件和 1 个 style 元数据；另有 28 个官网 block 页面，其抽测 `/r/<name>.json` 返回 500，只能查预览/文档，不能标成源码已下载。

```bash
npx shadcn@latest view https://www.kibo-ui.com/r/gantt.json --cwd apps/web
npx shadcn@latest add https://www.kibo-ui.com/r/gantt.json --cwd apps/web
```

Kibo 依赖随组件差异很大。比如 Gantt 同时使用 dnd-kit、Jotai、date-fns 和 throttle；选型前先读 Registry dependencies，禁止为了一个视觉样例无审计地引入整组运行时。

## 使用与组合

- Gantt 用于投放任务排期和依赖关系；Kanban 用于素材/流程协作；Calendar 用于排期，不代替简单日期筛选。
- Editor、Dropzone、Color Picker 进入正式页面前，与现有编辑器/上传链路/token 体系比较，避免双实现。
- block 只作为信息架构参考；没有可验证 Registry payload 时不从页面逆向复制源码。

## 修改与适配

1. 官方色彩可改，但必须映射项目 `surface/content/border/accent/status/chart` 语义 token。
2. Gantt/Kanban 的拖拽、键盘替代操作、自动滚动、冲突和保存失败状态进入业务 adapter。
3. 日期统一时区、周起始、中文 locale 和只读/权限状态。
4. 大数据量先做性能样本；不得把精美 demo 当作万级任务可用证据。
5. 文件放独立来源目录，保留上游 ref 与依赖清单。

## 许可证

公开 Registry 源码按 MIT 使用；docs-only blocks 只有元数据，不推断许可证范围内存在可复制源码。

## 更新与变更

更新时逐项比较 Registry 和依赖版本，重点回归拖拽、时间轴、编辑器输入、上传失败、键盘和移动端。

## 官方来源

- Components：<https://www.kibo-ui.com/components>
- Docs：<https://www.kibo-ui.com/docs>
- Registry：<https://www.kibo-ui.com/r/registry.json>
- Repository / License：<https://github.com/shadcnblocks/kibo>
