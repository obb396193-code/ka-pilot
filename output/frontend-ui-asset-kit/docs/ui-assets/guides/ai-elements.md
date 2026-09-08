# Vercel AI Elements 官方使用与适配指南

> 最后核验：2026-08-19  
> 目录：`../catalogs/ai-elements.json`（136）  
> 定位：内置 Agent 的对话、消息、推理、工具调用、来源引用和 Prompt 输入层

## 安装与获取

AI Elements 通过 shadcn Registry 按项复制源码；本项目只取当前 Agent 场景需要的条目，不执行整库覆盖：

```bash
npx shadcn@latest view @ai-elements/message --cwd apps/web
npx shadcn@latest add @ai-elements/message --cwd apps/web
npx shadcn@latest add @ai-elements/prompt-input --cwd apps/web
```

目标环境是 React 19、Tailwind CSS v4 和 shadcn/ui；涉及 AI SDK 的例子必须先区分纯展示组件与需要服务端流式协议的业务示例。

## 使用与组合

- `conversation` 负责消息列表与滚动，`message` 负责角色内容，`prompt-input` 负责输入和附件入口。
- `reasoning`、`tool`、`sources` 分别展示推理过程、工具执行状态和引用来源；不得用一段不可审计的富文本代替。
- 悬浮窗、全页 Agent 和任务详情内 Agent 共用同一消息状态模型，外层容器可不同。
- 官方 examples 是组合参考，不直接带入 demo API、模型 key 或假数据。

## 修改与适配

1. 颜色、圆角、字体、边框映射项目语义 token，不在组件里写第二套品牌变量。
2. 消息状态必须覆盖 streaming、complete、error、cancelled、retry；工具状态覆盖 pending、running、success、error。
3. 来源引用保留可追溯 URL/数据实体；产品敏感信息按本项目脱敏规则处理。
4. Prompt 输入的附件、快捷键、移动端高度和 IME 中文输入必须专项验收。
5. AI SDK 协议放 adapter，不把后端 provider 绑进视图组件。

## 许可证

官方仓库为 Apache-2.0。复制源码保留许可与来源记录。

## 更新与变更

更新时对照单项 Registry、仓库 commits/releases 和 AI SDK 兼容性，重点回归流式消息、工具调用、引用、键盘和移动端。

## 官方来源

- Docs：<https://elements.ai-sdk.dev/docs>
- Components：<https://elements.ai-sdk.dev/components>
- Setup：<https://elements.ai-sdk.dev/docs/setup>
- Usage：<https://elements.ai-sdk.dev/docs/usage>
- Registry：<https://elements.ai-sdk.dev/api/registry/registry.json>
- Repository / License：<https://github.com/vercel/ai-elements>
