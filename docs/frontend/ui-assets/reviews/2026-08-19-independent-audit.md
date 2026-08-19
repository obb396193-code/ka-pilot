# 2026-08-19 UI 资产独立审查与主 Agent 复核

> 范围：shadcn/coss、ReUI/Tremor、Aceternity/Magic UI/React Bits/tweakcn
> 工作方式：3 路只读 subagent 只交文本结论；共享文件由主 Agent 依据官方端点和本地快照逐项复核后修改。

## 结论

- 原 3,658 条目录确实只是 metadata，`local_path` 全空；不能称为“源码已下载”。
- 终验滚动到 12 条产品线、5,996 个逻辑资产：公开源码 3,753、公开元数据 67、购买后源码 2,176。最后一次联网门禁抓到 ReUI 官方当天新增 60 条，已在提交前刷新，未沿用较早的 5,936 快照。
- 当前 source health 为 11 verified、1 partial（Magic UI Pro 无公开总 manifest）、0 blocked；全量匿名 sync 曾因 GitHub API 限额出现 3 个 403，已用登录只读 API 确认对应公开树完整，3 个 403 不是会员墙。
- 5,996 条 catalog 快照仍保持 `source_cache_status=not-cached`，A 方案用独立 overlay 缓存 89 个公开源码条目/93 个物理文件，不反写成运行时已安装；运行仓第三方隔离目录源码仍为 0。

## 审查发现处置

| 审查面 | 子审查发现 | 主 Agent 处置 | 结果 |
|---|---|---|---|
| shadcn | 338 漏 144 个 New York v4 item，另有 11 个 synthetic marker | 直接读取官方 New York v4 Registry 471 条，与 `r/index.json` 逐名 union；移除 synthetic 口径，补 index 独有 questionnaire/toast | 接受，最终 473 logical items |
| shadcn variants | 3 foundations × 8 styles＝24，5,120 records 不能当唯一组件 | 读取 `r/config.json` 与 per-variant 规则；variant matrix 单列，记录 deduplicated 216 names | 接受，不并入 5,996 数量 |
| shadcn Directory/Figma | 280 个第三方 provider；3 free + 7 paid Figma kits | 只进 coverage/discovery 边界，不混进第一方组件 catalog | 接受，provider 内部 inventory 标 unresolved |
| coss current | 577 与 current Registry 完全一致 | 再次逐名解析 Registry，按 files 区分 570 public-source / 7 metadata-only | 接受 |
| coss Origin | 整库遗漏：599 components + 47 support＝646 | 用官方 Git tree + `apps/origin/config/components.ts` 生成独立 catalog，保留多分类 | 接受，标 maintenance-stale |
| coss orphan | `p-input-group-25` 公开但已移出 current source/Registry | 写入审计与指南，标 deprecated orphan，不计入 current 577 | 接受 |
| ReUI access | 早期 1,607 Registry 中 502 Pro Blocks 被误标 MIT/free；终验时 Registry 又增至 1,667 | 以 type/name 精确拆最终 1,149 free source 与 518 Pro，改商业许可/401/license-key | 接受并修复严重错误；新增 44 public + 16 Pro 全部入库 |
| ReUI completeness | 漏 638 Icons、10 Templates；16 variants 未记录 | 从 `llms.txt` 取 30 个 icon 分类，再读公开动态页逐项复现 638 exact names；补 10 templates 与 16-variant matrix | 接受，最终 2,315 logical items |
| ReUI category/preview | 多词类别被截成首词，Pro preview 指到无关 Docs | 分类改为保留完整 stem；Pro 路由按 group/category/item 生成，source 指 concrete item endpoint | 接受并修复 |
| Tremor current | 362 漏 DateRangePicker 能力、5 utilities、6 templates、1 Dashboard OSS variant | 逐项补入；Blocks preview 改 `blocks.tremor.so`；Raw 不再误写 npm package | 接受，最终 375 |
| Tremor legacy | 仍在线 `@tremor/react` 有 30 能力，无官方 deprecated 声明 | 单独 `tremor-legacy.json`，标 maintenance-stale 而非 deprecated | 接受 |
| Aceternity | 319 只对 AI Index 完整，112 free / 207 Pro；pricing 与 index 数冲突 | access 字段逐项落库；coverage 改 `complete-to-ai-index`；200+ vs 167 记 unresolved | 接受 |
| Magic UI Free | 247 free Registry 完整；1 style manifest 无源码；examples preview 错 | 按 files 分 246 source / 1 metadata，example preview 映射父组件，source URL canonical `.json` | 接受 |
| Magic UI Pro | 12 个公开页可复现 95 blocks，9 个公开模板名；无总 manifest | 精确收 95 + 9＝104；其中 3 public template repos，101 license-gated；coverage 明确 lower-bound | 接受但拒绝“104=Pro 全量” |
| React Bits Free | 166 正确，安装命令缺 `--cwd apps/web`，License URL 扩展名错 | 修命令与 `LICENSE.md`，保留四变体去重 | 接受 |
| React Bits Pro | 官网分组 134+238+300+11+19＝702；sitemap 另有 agent-skill setup | 只收 702 assets；`agent-skill` 是安装/说明页，不计 asset | 接受 702，拒绝把 setup 页算第 703 项 |
| tweakcn | 42 preset 完整但只存名字；community 可匿名分页却无稳定 total | 每项保存完整 token source；社区作为动态 discovery surface，不伪造永久全量 | 接受 |

## Task 8 A 方案与离线展厅复审

| 审查面 | 独立审查发现 | 主 Agent 处置 | 最终结果 |
|---|---|---|---|
| 源码缓存 | 早期 catalog 与 source cache 状态自相矛盾，且“文件数”混合物理文件和 Registry payload modules | 以 manifest overlay 重算每源 cached/not-cached，拆分 93 个物理文件与 103 个 payload 源码 module | 接受并修复；48 roots + 41 dependencies，89 entries，失败 0，付费缓存 0 |
| ReUI/Tremor 展示 | ReUI 丢失 Free/Pro/Ultimate、16 Registry variants/4 icon styles；Tremor duplicate/related 关系未展示 | 层级、variant matrix、2,552 icon render variants 和 DateRangePicker/dashboard-oss 关系全部进展厅 | 接受并修复 |
| 付费免费替代 | 首版用同品牌、描述停用词或整个 discovery 库制造大量伪匹配，还把 23 个 provider/category nodes 当具体资产 | 重写 schema v2，分离 role/match/confidence/review/license/cache；对 FAQ、sidebar、stats、template、sheet、social-proof、scheduling 补 17 个语义回归测试；新增 16 个 Pro Hero 全部要求组合 | 接受并大幅收紧；2,153 个具体能力＝272 direct + 638 icon semantic + 1,237 composition + 6 license check；unresolved 1,243 |
| 许可证 | Animate UI 漏标 Commons Clause，Aceternity Free 被过度视为已核许可 | Animate UI/React Bits 明标 redistribution restriction；Aceternity Free 保持 `license_verified=false` 并逐项复核 | 接受并修复；未绕过付费接口 |
| HTML 安全/可访问性 | CSS token/URL/class 注入、分页焦点不可见、移动导航和低高度 rail 等问题 | 构建端+客户端校验、固定 class enum、可见焦点、导航滚入和 rail 滚动 | 接受并修复；console 0 error/0 warning |
| 响应式 | 独立审查未发现，主 Agent 终验在 1024×500 抓到处置筛选栏溢出 35px | 移除 inline grid，改为 1180/560 可覆盖断点 class | 主 Agent 追加修复；1024 变两列、390 变单列，横向溢出 0 |

ReUI 当天新增 60 条后，三路审查全部按新哈希重新执行，不沿用旧 5,936 快照：ReUI/Tremor 审查确认 2,315 分层、60 条差异和 paid cache 0；shadcn/coss 审查确认 2,153 条映射闭合及 16 个 Hero 全部 composition；动效/主题审查确认新展厅内嵌数据、1024/390 响应式、断网分页、焦点、安全和外部请求 0。三路均终签通过，无 P0/P1 残留。

```text
reui catalog sha256：560de96fe9d8c6b87a25acadfa430364a86078716ce8423ca11ae365dbbb220e
free alternatives sha256：588e5af66f76d5000413dedd415da58fcecc6fc4551cdad3cdd79ac80067f5fe
showroom data sha256：d9e1e37116196f8720b620cb648c4ccd6ba715a6dee7f34f13c85c409eb572f0
showroom html sha256：f99d127d919da8f7c035c162410bd20ffbdd95898f9573281857c45974c388e0
```

## 主 Agent 机械复核

执行并通过：

```text
当前目录快照：12/12，5,996 items
官方 endpoint health：12 total，11 verified，1 partial，0 blocked
目录重复 identity：0
catalog source cache：0/5,996
runtime UI local files：22；明确引用 20；exact provenance verified 0
selected third-party runtime source files：0
A 方案公开源码缓存：48 roots + 41 dependencies＝89 entries/93 physical files；paid entries 0
付费处置闭合：272 + 638 + 1,237 + 6＝2,153；unresolved＝1,237 + 6＝1,243
离线展厅：5,996 unique assets；embedded JSON 与 showroom-data 深度一致；外部运行时请求 0
```

关键官方入口：

- shadcn：<https://ui.shadcn.com/r/styles/new-york-v4/registry.json>、<https://ui.shadcn.com/r/index.json>、<https://ui.shadcn.com/r/config.json>
- coss：<https://coss.com/ui/r/registry.json>、<https://github.com/cosscom/coss/tree/main/apps/origin>
- ReUI：<https://reui.io/llms.txt>、<https://reui.io/r/registry.json>、<https://reui.io/legal/license>
- Tremor：<https://www.tremor.so/docs>、<https://blocks.tremor.so/blocks>、<https://blocks.tremor.so/templates>
- Aceternity：<https://ui.aceternity.com/ai-recommendations>、<https://ui.aceternity.com/licence>
- Magic UI：<https://magicui.design/r/registry.json>、<https://pro.magicui.design/sitemap.xml>
- React Bits：<https://reactbits.dev/>、<https://pro.reactbits.dev/sitemap.xml>
- tweakcn：<https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts>、<https://tweakcn.com/community>

## 未解决但已显式暴露

1. shadcn Registry Directory 的 280 个第三方 provider 没有统一 item count/license/price；需按实际业务候选逐 provider 审计。
2. Aceternity Pricing 的“200+ blocks”与 AI Index 167 leaf blocks 无法在未购买条件下消解。
3. Magic UI Pro 没有公开总 manifest，104 只是可复现下限。
4. tweakcn community 是动态集合，只能做带日期快照。
5. 运行仓 22 个历史 `components/ui` 文件没有 exact upstream ref/hash；后续触及时补 provenance，不在本次脏 F-001 工作树上机械覆盖。
6. 完整离线优先使 `showroom.html` 约 9.92 MB、`showroom-data.json` 约 13.02 MB；本轮接受该体积换取单文件离线搜索，后续若在低端移动端发布再做字典化/分片。
7. 展厅页码与筛选条件未进 URL，刷新不保留位置；不阻断当前本地选型。
