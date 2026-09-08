# 快手磁力引擎开放平台 MAPI 官方文档首批证据快照

> `document_id`: `ka-src-0007`  
> 抓取时间：2026-08-20（Asia/Shanghai）  
> 官方入口：https://developers.e.kuaishou.com/docs?docType=DSP&documentId=&menuId=3033  
> 访问方式：公开页面，只读访问；未登录、未调用任何媒体接口、未创建或修改广告对象。  
> 凭证处理：不保存官方示例中的 Access-Token、Cookie、secret 等值；本文件只保留字段名、接口路径和无凭证事实。

## 1. 来源与范围

官方入口标题为“快手磁力引擎开放平台”。入口自动跳转至 MAPI 注册授权说明：

- URL：https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2539&menuId=3765
- 页面更新时间：2025-12-29 20:13
- 官方定义：Marketing API（MAPI）把磁力引擎广告投放能力以标准化 API 对外开放，支持广告主、代理商和第三方服务商建设投放/分析工具。

本次只建立“首批可用于 KA 产品判断”的快照，不宣称完成全站镜像。已核验目录包括：快速入门、Token、账户服务、投放管理、数据报表、资金、素材、频控与创建限制；未调用需要 access token 的业务接口。

## 2. 权限与 Token

| 文档 | 官方 URL | 页面更新时间 | 已确认内容 |
|---|---|---|---|
| scope 权限说明 | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2540&menuId=3766 | 2024-06-13 16:31 | `report_service` 用于报表；`account_service` 用于账户/余额/流水；`ad_query` 用于计划/组/创意查询；`ad_manage` 用于计划/组/创意创建修改及人群管理；部分能力需加白。 |
| 获取 token | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=3085&menuId=3784 | 2024-09-02 10:28 | `POST /rest/openapi/oauth2/authorize/access_token`；使用授权码换取 access token 与 refresh token。 |
| 拉取 token 下授权广告账户 | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=3025&menuId=3800 | 2024-09-09 21:24 | `POST /rest/openapi/oauth2/authorize/approval/list`；返回授权广告主 ID；单页最大 200。 |
| Token 的有效期和续期 | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2541&menuId=3768 | 2024-06-13 16:31 | access token 有效期 1 天；refresh token 有效期 30 天；刷新后新旧 token 发生替换，旧 token 不再可用。 |

## 3. 首批接口索引

### 3.1 账户与资金（一期直接相关）

| 能力 | 版本 | 接口 | 方法 | 文档 URL | 更新时间 |
|---|---:|---|---|---|---|
| 获取广告主资质信息 | 0.0.1 | `/rest/openapi/v1/advertiser/info` | POST（页面请求样例显示 GET，存在方法冲突） | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2613&menuId=3337 | 2024-07-22 23:52 |
| 获取广告账户余额 | 0.0.1 | `/rest/openapi/v1/advertiser/fund/get` | GET | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2614&menuId=3338 | 2025-11-18 14:17 |
| 获取广告账户流水 | 0.0.1 | `/rest/openapi/v1/advertiser/fund/daily_flows` | GET | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2863&menuId=3597 | 2025-11-18 14:20 |

账户余额响应区分充值余额、框返余额、激励余额、共享钱包余额；账户流水包含每日实耗、各资金类型花费、转入转出和日终结余。金额单位以目标接口字段定义为准，不允许跨字段猜测单位。

### 3.2 广告计划、广告组、创意（一期直接相关）

| 对象/动作 | 版本 | 接口 | 方法 | 文档 URL | 更新时间 | 风险 |
|---|---:|---|---|---|---|---|
| 创建计划 | 0.0.7 | `/rest/openapi/gw/dsp/campaign/create` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2565&menuId=3288 | 2026-06-08 13:20 | 写 |
| 查询计划 | 0.0.5 | `/rest/openapi/gw/dsp/campaign/list` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2568&menuId=3290 | 2026-04-01 15:55 | 读 |
| 修改计划状态 | 0.0.1 | `/rest/openapi/v1/campaign/update/status` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2569&menuId=3291 | 2024-07-22 23:46 | 高风险写；删除会连带删除下级对象 |
| 创建广告组 | 0.0.18 | `/rest/openapi/gw/dsp/unit/create` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2570&menuId=3292 | 2026-07-15 11:33 | 写 |
| 查询广告组 | 0.0.9 | `/rest/openapi/gw/dsp/unit/list` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2572&menuId=3294 | 2026-06-08 13:46 | 读 |
| 修改广告组预算 | 0.0.1 | `/rest/openapi/v1/ad_unit/update/day_budget` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2573&menuId=3297 | 2024-07-22 23:46 | 高风险写 |
| 修改广告组状态 | 0.0.1 | `/rest/openapi/v1/ad_unit/update/status` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2575&menuId=3298 | 2024-07-22 23:47 | 高风险写；删除会连带删除创意 |
| 修改广告组出价 | 0.0.2 | `/rest/openapi/v1/ad_unit/update/bid` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2576&menuId=3299 | 2025-02-24 14:20 | 高风险写 |
| 创建自定义创意 | 0.0.3 | `/rest/openapi/gw/dsp/creative/create` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2577&menuId=3300 | 2026-08-06 19:12 | 写 |
| 查询自定义创意 | 0.0.1 | `/rest/openapi/gw/dsp/creative/list` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2582&menuId=3305 | 2025-08-12 21:12 | 读 |
| 修改创意状态 | 0.0.1 | `/rest/openapi/v1/creative/update/status` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2584&menuId=3307 | 2024-07-22 23:49 | 高风险写 |
| 获取创意审核详情 | 0.0.1 | `/rest/openapi/gw/dsp/creative/element/reviewDetails` | POST | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2611&menuId=3335 | 2024-07-04 19:10 | 读 |

创建计划页确认存在媒体原生字段：`auto_adjust`（自动调控）、`auto_build`（自动基建）、`auto_manage`（智能投放）。`auto_build` 的命名规则要求同时包含日期和序号宏变量，且页面明确标注为白名单能力；不能把字段存在解释成所有账户可用。

创建创意页说明每个搜索广告推广组最多创建 15 个创意；2026-03-23 起，经 MAPI 创建广告时对应视频在快手号个人主页默认为单次可见。审核详情返回商业审核/社区审核状态、拒绝原因、限流原因和修改建议。

### 3.3 实时报表（一期直接相关，但不替代当前启航主链路）

| 粒度 | 版本 | 接口 | 文档 URL | 更新时间 | 关键限制 |
|---|---:|---|---|---|---|
| 广告主 | 0.0.9 | `/rest/openapi/v1/report/account_report` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2606&menuId=3330 | 2026-05-14 10:39 | 最近 7 天；日期跨度不超一周；日/小时粒度；单页最大 2000。 |
| 广告计划 | 0.1.3 | `/rest/openapi/v1/report/campaign_report` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2607&menuId=3331 | 2026-07-20 20:22 | 日/小时粒度；单次 campaign IDs 不超 5000。 |
| 广告组 | 0.1.4 | `/rest/openapi/v1/report/unit_report` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2608&menuId=3332 | 2026-07-20 20:17 | 不含省心投物料；单次 unit IDs 不超 5000。 |
| 自定义创意 | 0.1.1 | `/rest/openapi/v1/report/creative_report` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2609&menuId=3333 | 2026-07-20 20:25 | 不含省心投物料；可扩展返回视频 ID/MD5。 |
| 素材报表 | 未标注 | 轻雀嵌入页 | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2975&menuId=3722 | 2026-07-20 20:42 | 本轮只确认目录和更新时间，接口细节待二次抓取。 |

官方“频控和创建限制”页另称：实时报表只支持近 7 天；异步任务报表支持近 6 个月且每天最多 50 个任务；分时查询只支持近 7 天。该页与目标接口页发生冲突时，目标接口页和真实授权账户探针优先。

### 3.4 素材（一期/后续均有价值）

| 能力 | 版本 | 接口 | 文档 URL | 更新时间 |
|---|---:|---|---|---|
| 上传图片 v2 | 0.0.1 | `/rest/openapi/v2/file/ad/image/upload` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2930&menuId=3680 | 2025-03-11 11:11 |
| 查询图片列表 | 0.0.1 | `/rest/openapi/v1/file/ad/image/list` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2629&menuId=3353 | 2024-07-04 19:35 |
| 上传视频 v2 | 0.0.1 | `/rest/openapi/v2/file/ad/video/upload` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2634&menuId=3358 | 2024-10-31 11:37 |
| 查询视频列表 | 0.0.1 | `/rest/openapi/v1/file/ad/video/list` | https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2639&menuId=3363 | 2025-11-20 11:29 |

视频列表可返回转码/审核状态、来源、宽高/时长、素材质量、重复度、延审、跑量分、内容标签、原生视频状态等字段。这些字段对素材库、审核看板和策略分析有直接价值，但字段中有官方标注“已废弃”或“描述待修改”的项，必须逐字段保留版本和可用状态。

## 4. 频控与官方文档冲突

接口调用分级页：https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2545&menuId=3260（更新时间 2024-06-13 16:32）

- 频控可在应用、接口、广告账户三个维度交叉生效。
- 默认 AppID 为第二等级，应用维度 QPM=2000；分级从 1000 到 5000。
- 建议错峰、按需调用；部分接口另有日限。

频控和创建限制页：https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2544&menuId=3259（更新时间 2024-06-13 16:31）

| 冲突项 | 老汇总页 | 新目标接口页 | 本资料处理 |
|---|---|---|---|
| 计划创建路径 | `/rest/openapi/v2/campaign/create` | `/rest/openapi/gw/dsp/campaign/create` | 不编码老路径；以目标接口页和授权探针为准。 |
| 计划总数 | 最多 1000 | 创建计划页写最多 500 | 标 `official_conflict`，上线前实测并向媒体确认。 |
| 组/创意创建路径 | v2 路径 | 2026 页面使用 gw/dsp 路径 | Capability Registry 必须记录接口版本和更新时间。 |
| 广告主资质请求方法 | 页头写 POST | 同页 curl 样例写 GET | 标 `official_conflict`，不得只按样例或页头单方实现。 |

## 5. 实验能力检索

2026-08-20 在官方站内搜索框检索“实验”，页面返回“未查询到接口”。这只能证明当前公开索引没有命中以“实验”为名称或字段的接口，不能证明快手内部、白名单或其他产品线绝对不存在实验能力。

首批目录与接口页没有发现 control/treatment、随机分流、稳定流量分配或统计显著性原生对象。因此，MAPI 能支撑“创建对象、调预算/出价/状态、拉报表”，但不能据此认定媒体已提供完整 A/B 实验编排。

## 6. 证据边界

- 本文件确认的是“官方文档公开声明”和“页面在抓取日可访问”，不是当前公司/账户已获 scope、白名单或可调用。
- 未登录、未取 token、未发起任何 API 请求，因此没有验证响应、错误码、频控实况和账户能力。
- 官方文档自身存在版本/路径/方法/数量限制冲突；任何生产实现必须再做目标账户只读探针，写接口必须 dry-run/预览/人工确认。
- 页面内容会更新；后续复抓应比较 `documentId + 页面版本 + 更新时间 + 内容 hash`，不得只看 URL。
