# Frontend UI Asset Kit Agent Rules

1. 新组件先查 `docs/ui-assets/capabilities.json`、catalog、guide 和 showroom。
2. catalogued/cached/installed/adapted 必须分开汇报。
3. 同能力多候选使用相同业务数据、中文、宽度、主题和状态比较。
4. 只从 `docs/ui-assets/source-cache/manifest.json` 指向的官方 payload/raw source 复制。
5. 受限来源只看元数据和官网，禁止从预编译 bundle 反推源码。
6. 字体、数字、布局和动画遵循推荐基线；真实效果不佳时调整语义 token 并留下证据。
7. 页面完成后使用 `docs/ui-assets/前端视觉与体验审核清单.md` 审核。
8. 任何公开发布或再分发前重新审计许可证和依赖。
