# GitHub 复用仓库导出说明

> 目标仓库：[obb396193-code/frontend-ui-asset-kit](https://github.com/obb396193-code/frontend-ui-asset-kit)（private）
> 原则：介绍和全量元数据尽量保留；源码、预览和二进制制品只按许可证白名单导出。

## 为什么不直接推整个投放 Agent 仓库

当前仓库包含产品 PRD、契约、跨 Agent 信箱和公司项目规则，不适合作为通用 UI 仓；第三方资产也有 MIT、Apache-2.0、Commons Clause、逐项许可和 Pro/Ultimate 等不同边界。独立导出可以让其他系统复用，同时不把项目专属内容和受限源码一起带走。

## 导出内容

- 17 条产品线 catalog、能力索引、覆盖审计、来源健康和官方指南。
- 前端工作流、文字/数字/布局/动画规范、ECharts/Storybook 规则和审核模板。
- 付费能力免费替代、许可证说明、决策和审查证据。
- 明确 MIT/Apache-2.0 且路径边界已核验的官方源码缓存。
- 许可证白名单内的离线代表预览和轻量 showroom。
- 通用 `AGENTS.md`、第三方许可证、排除清单与逐文件 export hash。

## 只保留元数据、不导出源码

- Aceternity：Free item 仍需逐项核条款与素材。
- Animate UI：MIT + Commons Clause，不发布可复用组件库镜像。
- React Bits：MIT + Commons Clause；Pro 另受付费许可。
- Magic UI Pro 公开样例：具体仓许可证未在当前 manifest 中确认。
- ReUI Pro/Ultimate、React Bits Pro 和所有会员/401 项。

## 生成与验证

```bash
node scripts/export-frontend-ui-asset-kit.mjs --output output/frontend-ui-asset-kit
node --test scripts/export-frontend-ui-asset-kit.test.mjs
```

导出器只允许目标目录 basename 为 `frontend-ui-asset-kit`，避免误删仓库或宽泛目录。每次重建会替换该精确输出目录，并重新生成 `export-manifest.json`。

## 上传

```bash
cd output/frontend-ui-asset-kit
git init
git add .
git commit -m "feat: publish reusable frontend UI asset kit"
gh auth status
gh repo create frontend-ui-asset-kit --private --source . --remote origin --push
```

如果 `gh auth status` 失败，必须由账号所有者重新完成 GitHub 授权；不得把临时 token 写进仓库或对话。

首次上传已完成：远端默认分支 `main`，首个导出 commit 为 `454b0e7b4ae1a890119632259823b5004d3a3c62`。以后更新仍必须先重建、测试和复核，再在独立导出仓库提交/推送。

## 公开前必须再做

- 移除或补齐 compiled preview 的所有依赖 notices。
- 复核第三方截图、字体、图片和图标权利。
- 重新拉取所有上游 LICENSE/NOTICE，并检查许可证是否变化。
- 重新跑敏感词、绝对路径、JSON、链接和逐文件 hash 审计。
