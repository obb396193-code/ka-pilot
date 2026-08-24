# ka-src-0009 独立评估：腾讯广告 Marketing API 公开文档镜像

> 状态：`analyzed / review_pending / not_ready`  
> 证据等级：E2（公开镜像，官方内容特征强，镜像所有权待补证）  
> 命名：正式标题使用“腾讯广告 Marketing API”；`ADQ`、“广点通”、TSA/GDT 只作历史/字段级检索别名。

## 结论先行

这批文档对开发者“发现腾讯广告能力、检索字段和找官方原站页面”有用，但不能作为可执行 Contract：307 篇 API 中 306 篇存在“文字说 Query Parameter，OpenAPI 却标 header”的转换错误，`servers` 也含占位/错域名。已发现并标注 1 个确定 endpoint 错误。

其中“拆分对比实验”的 add/update/delete/get 四个页面对我们的 AI 实验编排有直接参考价值，但这不等于已能把腾讯原生实验接入快手一期。

## 1. 原始资料摘要

- 公开 Apifox `llms.txt` 列出 315 页：8 篇指南、307 篇 API，315/315 抓取成功。
- 307 篇 API 都有 OpenAPI `paths`；镜像原始路径去重为 297，纠正已知冲突后为 298。
- 从镜像正文去重出 320 个 `developers.e.qq.com` 官方原站页面 URL，仅作引用索引，本资产未全量归档官方原站枚举/专题/公告/附件。
- 镜像归属未获腾讯公开声明证实，因此 catalog 标为 E2/research，不写“官方托管”。

Canonical 资产：`private/knowledge-sources/ka-src-0009/source-manifest.json`；archive SHA-256=`69127e89c9a17a68e96e10fefdb08287cf815e441fd101b83d01c2de88583a02`。

## 2. 已确认事实

1. [腾讯广告官方开发者站](https://developers.e.qq.com/docs) 为官方入口，业务 API 生产域名为 `api.e.qq.com`，沙箱为 `sandbox-api.e.qq.com`。
2. 当前指南称 v1.3 为最新版本；官方原站部分历史页仍展示 V1.1 示例，不能据此断言旧版已废止。
3. 镜像有 4 个拆分对比实验页：`/v1.3/split_tests/add|update|delete|get`。
4. 创建实验可绑定 2–5 个广告组；广告组需处于待审核且未绑定其他实验。
5. 暂停/重启实验会同步影响绑定广告组；实验正常运行时已绑定广告组不允许更新。
6. 实验“全量”后不再分流，广告获得 100% 流量，平台返回全量推荐度和推荐广告组列表。
7. 删除实验存在高风险语义：正常/暂停时删除实验会同步删除关联广告；全量状态才只删实验记录。
8. 镜像 `api-121814565` 将“运营推荐弹幕”写成 `/v1.3/barrage/get`；[腾讯官方原站](https://developers.e.qq.com/docs/api/business_assets/barrage/barrage_recommend_get) 明确为 `/v1.3/barrage_recommend/get`，已保留 observed 值并标 `source_conflict`。

## 3. 合理推断

- 原生 split-test 能力可成为腾讯 provider 的实验 adapter，我方仍需统一的实验元数据、分析计划和交叉渠道效果回收。
- “正常运行时不许改绑定广告组”与我们建议的 experiment lock 一致：这是实验纯净性保护，不是黑盒优化。
- 镜像可作为检索索引，每个真正实现项必须回到官方原站和授权沙箱复核。

## 4. 宣传性表达

“推荐度”“智能扩量”“全量”是媒体功能语义，不证明其计算方法、统计显著性、因果有效性或适合我方目标。

## 5. 未证实项

- Apifox 项目 3515798 的所有者是否为腾讯官方。
- 307 页镜像是否与官方原站当前字段、限制、方法逐页完全一致。
- 拆分实验的随机化机制、流量比例可配范围、统计方法、显著性与污染检测。
- `smart_expand_enabled` 灰度能力的可用账户范围。

## 6. 对我们产品是否有帮助

有：可用于腾讯广告 provider 能力发现、跨渠道对象建模、实验状态机、高风险删除语义和效果回收字段借鉴。不应用于直接生成 SDK、Contract 或生产请求。

## 7. 对应现有功能

| 腾讯能力 | KA 当前设计 | 判断 |
|---|---|---|
| campaign/adgroup/adcreative 等投放对象 | 账户资源、自动基建、Capability Registry | 可对齐 canonical model，保留 provider extension |
| reports/insights | 数据分析、策略中心、效果回收 | 后续跨渠道时映射，不进快手一期 |
| split_tests | 工作流、测品/实验、效果回收 | 原生 adapter 候选，需官方 Contract 与沙箱复核 |
| 删除/暂停/全量 | 变更集、确认门、幂等、回查 | 必须以 L3 高风险处理，删除前显示连带影响 |
| 指南/枚举/官方链接 | 知识库 | 镜像只做研发索引，正式口径引用官方原站 |

## 8. 已包含能力

- 自动基建、工作流、变更集/确认门、效果回收、知识库、Capability Registry 已在产品设计中。
- 产品已有显著性标注与工作流画布方向，可作为未来实验编排容器。

## 9. 部分包含能力

- 当前“效果回收”主要围绕变更后 T+1，尚无 split-test 的全量状态、推荐度、winner 和样本治理。
- 工作流可实现“创建→启动→暂停→全量→回收”，但尚无专用 experiment state machine 与交叉渠道标准。

## 10. 缺失能力

1. 腾讯官方 Contract 的稳定归档与差异校验。
2. 主体/OAuth/账户/能力权限的真实沙箱验证。
3. 实验前假设/指标/样本计划，实验中污染/guardrail，实验后统计决策。
4. 删除实验的特殊连带删除风险模型。

## 11. 与现有设计冲突的地方

- 腾讯广告不属于一期渠道，不能因资料完整就插队开发。
- 实验 delete 的连带删除语义比常规变更更危险，不能使用低风险确认卡。
- 若 Agent 在实验正常状态中继续调价/调定向，会与媒体“绑定广告组不可更新”冲突，也会污染实验。

## 12. 可以直接借鉴的内容

- 2–5 实验组、未绑其他实验、正常时冻结更新等预检。
- 实验正常/暂停/全量/删除状态和事件审计。
- winner/recommended list 和全量后数据回收字段的展示方式。
- 镜像路径保留 observed 与 corrected 双值、记录官方证据 URL 的治理方式。

## 13. 不建议照搬的内容及原因

- 不照搬镜像 OpenAPI：参数位置、server 和个别 endpoint 已证实有错。
- 不把“全量”简化为“结束实验且只保留 winner”：媒体文档表明所有广告变为 100% 流量，后续状态处置仍需用户/策略决定。
- 不开放 Agent 直接删除实验：可能连带删除广告。
- 不把 ADQ/广点通当成当前 API 正式名称。

## 14. 对 PRD 的影响

本轮不改冻结 PRD。后续候选：

- P2 实验编排增加 provider-native experiment adapter 概念。
- 变更风险字典允许 provider/action/state 组合定级，避免将所有 delete 当成相同风险。
- 知识库补 `source_conflict / mirror_ownership / executable_contract_status`。

## 15. 对后端架构的影响

- 对官方原站和镜像建 source precedence：official current page > official guide/reference > mirror snapshot。
- Contract 生成只允许审核通过的官方 machine-readable source；该镜像状态是 `non_executable_mirror_conversion`。
- experiment delete 执行器必须在预览中枚举连带广告并要求 L3 确认；不提供无确认自动路径。

## 16. 对前端产品设计的影响

- 实验页显示 provider 原生状态与 KA 统一状态的映射。
- 删除弹层明示“会删实验记录”还是“会连带删广告”，不用泛化“删除成功”。
- 文档页显示 E2、镜像归属待补证、已知冲突和“不可生成 SDK”标识。

## 17. 对 Agent、工作流、知识库的影响

- Agent 可以检索镜像定位官方页，但引用正式口径时必须转到官方原站。
- 工作流实验节点必须冻结已绑定广告组的竞价参数；guardrail 例外要记录为截断/污染事件。
- 知识库不得将该 E2 镜像放入“默认可执行 Contract”召回集。

## 18. 建议动作

`reference + evidence_required`：保留完整镜像与官方链接索引；对 split-test 和后续高价值接口逐页回官方原站补证、授权和沙箱验证。

## 19. 建议优先级

- P0：作为未审查研发索引，不进产品默认知识。
- P1：完成 source precedence/conflict/contract trust 治理字段裁决。
- P2：腾讯渠道纳入路线图后，优先复核 OAuth、投放对象、报表与 split-test；不全量封装 307 页。

## 20. 需要审查 Agent 裁决的问题

1. 是否同意 `ka-src-0009` 保持 E2/research，不因内容高度一致而升为“官方托管”？
2. 是否批准该资产作为研发检索索引，但明确禁止作为 SDK/Contract 生成源？
3. 是否将 split-test 四个能力放入 P2 媒体原生实验 adapter 补证清单？
4. 实验 delete 的连带删除是否一律 L3 + Web 明细确认，禁止 Agent 无人确认执行？
5. 官方原站的枚举/专题/公告/附件是否建第二批归档，还是仅在具体开发需求时按需抓取？

## 独立审查记录

腾讯审查 Agent 复算 315=8+307、297 个镜像原始唯一路径，并发现：归属表述过度、OpenAPI 系统性转换错误、推荐弹幕 endpoint 确定冲突、10 组重复路径、旧版本语义与 ADQ/广点通命名边界。本资产已修正所有权口径、保留 observed/corrected 冲突、统计 306 篇 Query/header 错位，并增加 320 个官方链接索引。
