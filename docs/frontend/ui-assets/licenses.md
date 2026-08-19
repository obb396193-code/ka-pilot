# UI 资产许可证与复制边界

> 最后核验：2026-08-19  
> 这是一份工程准入摘要，不替代正式法律意见；具体文件的许可证优先于项目级摘要。

| 来源 | 当前许可证判断 | 可复制修改 | 主要限制/动作 |
|---|---|---|---|
| shadcn/ui | MIT | 是 | 社区 Registry 另核许可证 |
| coss/ui | `apps/ui`/`apps/origin` MIT；仓库其余默认 AGPL-3.0 | 仅确认在 MIT 范围后 | manifest 记录原始文件路径，禁止顺手复制仓库其他目录 |
| ReUI Free | MIT | 是 | 仅限公开 examples/modules/hooks；外部依赖/图片另核 |
| ReUI Pro/Ultimate | 自有商业许可 | 许可项目内可修改 | Blocks/Icons/Templates 禁止公开仓库、镜像 Registry 或再分发源码 |
| Tremor | Raw/旧 npm/Dashboard OSS 为 Apache-2.0；Blocks/6 个 current templates 为 MIT | 是 | 按具体仓库保留 notices/来源，不合并写成一个 license |
| Aceternity Free | per-item/网站条款，不能自动视为 MIT | 逐项核验 | Registry 可安装不等于可再分发组件库 |
| Aceternity Pro | 自有商业许可 | end product 内可修改 | 禁止 source/stock/template/marketplace 再分发 |
| Magic UI Free | MIT | 是 | 外部素材/依赖另核 |
| Magic UI Pro | 自有商业许可；3 个公开模板逐仓核验 | 许可项目内可修改 | Pro 源码需 token，禁止再分发；公开仓库不自动等于 MIT |
| React Bits Free | MIT + Commons Clause | 商业项目可用/可改 | 禁止作为竞争性组件库/服务销售或再分发 |
| React Bits Pro | 独立付费许可 | 购买范围内 | 受鉴权 Registry，不进免费快照源码 |
| tweakcn | Apache-2.0 | 是 | 社区主题、字体、图片逐项核验 |
| Vercel AI Elements | Apache-2.0 | 是 | examples 中的模型/API/第三方依赖另核，不带入密钥与 demo 服务 |
| Kibo UI | 公开 Registry 源码 MIT；docs-only blocks 仅有元数据 | Registry 源码可改 | 28 个 block 当前无可验证 payload，不从页面逆向复制 |
| Dice UI | MIT | 是 | Base/Radix variants 与外部上传/媒体依赖逐项核验 |
| Animate UI | MIT + Commons Clause | 应用内可用/可改 | 禁止销售、托管或再分发组件库本身，不发布本地 Registry 镜像 |
| Motion Primitives | MIT | 是 | `motion` 等依赖另核并记录 |

## 源码进入仓库前

必须登记：

- source/item/source URL；
- 上游 commit/tag/registry hash；
- 许可证 URL 与具体适用范围；
- install/view command；
- 本地路径与修改说明；
- 是否包含字体、图片、图标或其他第三方资产。

## 禁止

- 把 Pro 源码放进公开/可分发组件包；
- 因为“基于 shadcn”就假设第三方也是 MIT；
- 从混合许可证 monorepo 复制时只看根 README 不看实际目录；
- 删除必要 copyright/license notices；
- `access_status=paid-source-after-license` 时在未取得合法许可前下载源码。
