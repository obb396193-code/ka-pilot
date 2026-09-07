# 消息中心与IM工具

## 概述

本页汇总巴拿马跨境分销（淘系海外 OVS 供给侧）中"消息"相关的两条技术主线：

1. **客服沟通 IM 工具**：面向分销商与淘宝卖家（千牛）之间的即时消息互通。核心是新建 IM 应用 `ovs-pnm-im`，通过集团 **IM PaaS（Bentley/钉钉 IM）** 承载消息收发与存储，通过"手淘消息互通模块"与手淘/千牛体系桥接；后续迭代包括 IM 5.0（旺旺昵称/卖家昵称对齐）、头像与图片、MTEE 内容合规、安全计费、对外 API（免登内嵌）等。
2. **消息链路 / 消息中心**：面向"商品/订单变更"的业务事件通知链路。核心是 `ovs-pnm-item`（分销商品消息中心，对接货源消息、聚合发送分销商品消息）与 `ovs-pnm-open`（分销商消息发送中心 + 开放平台对外推送），底层依赖 MetaQ，并沉淀了统一的 MetaQ 消息工具 `ovs-pnm-tools-starter`。

两条主线共享的基础设施是 **MetaQ 消息队列**（IM 侧用于接收手淘下行消息，消息中心侧用于商品/订单事件流转）与 **ovs-pnm-*** 系列应用。

相关业务背景见 [[巴拿马跨境分销业务与产品总览.md]]；订单/履约消息见 [[采购交易与履约链路.md]]；开放平台账号与登录态见 [[账号体系与开放平台.md]]。

---

## IM 工具架构与演进

### 选型：集团 IM PaaS（而非自建）

- **放弃自建 IM**：研发周期长、完成度/稳定性短期难保障、需持续维护，成本高。
- **采用集团 IM PaaS**：集团内 IM 基础设施，完成度与扩展性高，但有预算消耗。整体成本估算约 **10.4 万/年**（含 DAU、消息发送/接收、消息存储、多媒体计算/存储等，含集团 0.45 折扣）。

### 系统边界与核心建设

- **IM 应用 `ovs-pnm-im`**：国内中心部署（na610 / na610，每机房各两台）。
- **后端建设**：新建 IM 应用、手淘消息互通模块、IM PaaS 接入、前台服务输出（MTOP）。
- **前端建设**：前台交互视觉、IM SDK 接入。
- **关键定位**：
  - 与手淘消息之间**仅有消息发送调用 + 接收 IM 消息发送通知**，经"互通模块"桥接，前台本质上是两套体系。
  - 聊天消息主要**存储在 PaaS 侧（国内）**，经分销 portal（国外）提供 IM 产品服务，符合数据安全要求。
  - 前端调用的 IM 能力主要来自 SDK。

### 手淘消息互通（接入参数）

- 手淘消息 `biztype = tmOversea`（手淘定义）。
- 业务身份（后端服务调用）：`appid = 3627555158`，`appkey = 0a7654b2c3bbaf5b8d5eba95394c33d6fcdc4a70`。
- 采购员买手账号打标 `domainTag = tmovs_panama_buy`（存量账号上线前批量打标，新增账号在创建时打标）。
- **消息构建类**（`com.taobao.alimp.bentley.client.msg2.model.content`）：`TextMessageContent` / `ImageMessageContent` / `AudioMessageContent` / `VideoMessageContent`。
- **消息发送**：`com.taobao.alimp.bentley.client.msg2.service.MessageService#send(BizIdentity, MessageRequest)`。
- **消息接收（下行）**：MetaQ `topic = "imsaas-notification"`，`tag = "tmOversea-IM.MSG"`；消息体含 `bizDomain=tmOversea`、`cid`、卡片模板（如 `cbu_im_contract_create`「买家已发起合约」）等。收到手淘卡片消息时转换成自定义消息，`type` 与手淘消息类型保持一致。

### IM PaaS 接入（钉钉/Bentley）

- 巴拿马分销接入 IM PaaS：TOP `AppKey = 34301609`，App 名称 = **巴拿马分销采购工作台**，平台 = Web，互提规则默认。
- 钉钉分配：`domain = cbdistribution`，`appkey = 5bc526c64b02846cba045fc5765927be`。
- **SPI 最小实现**：
  - 消息发送回调（消息安全校验/信息扩展，**转发消息给淘宝商家**）。
  - 单聊会话创建回调（会话 ID 规则 `${分销商ID}@distirbution:${商家sellerId}@taobao`）。
  - 会话视图创建回调。
- **前端 SDK**：`@ali/dd-im-paas-jssdk` + `@ali/dd-im-paas-data-sdk`（`sendTextMessage` / `sendPhotoMessage` / `sendAudioMessage` / `sendVideoMessage`）。前端 IMSDK 初始化时设置 token 获取函数。

### MTOP 接口

| 接口 | 描述 |
| --- | --- |
| `mtop.ovs.pnm.im.token.get` | 获取 IM 登录鉴权 Token（实现：`com.alibaba.ovs.panama.hsf.provider.im.OvsPaaSLoginService#getIMPaaSLoginToken`） |
| `mtop.ovs.pnm.im.unread.count` | 获取分销商未读用户数 |
| `mtop.ovs.pnm.gray.check` | 场景灰度判断（入参 `{"scene":"im"}`，出参 `{"isInGray":true/false}`） |

### 灰度与数据

- **灰度工具**：基于 `pnm.grey.tool` 配置（`group=ovs-pnm-open`，`namespaceId=ovs-pnm-open`），按 `scene`（如 `imOpen`）+ `userIds` 白名单控制；导航接口 `mtop.alibaba.ovs.panama.distributor.top.navigation.get` 返回 `greyConfigList` 控制 IM 入口是否放量。
- **数据回流**：从 PaaS 侧 `impaas.s_message_common_delta` 抽取 `sender_uid` domain 为 `cbdistribution` 的聊天数据。
- **稳定性**：消息发送量实时监控 + 发送成功率监控（总体 + by 分销商）。

### 关键约束

- 消息领域模型沿用 PaaS 侧定义（单聊消息、会话、会话视图）。
- 本期**无法支持千牛端感知分销商的已读/未读**。
- IM PaaS SDK 的安全接入策略仅适用国内业务；国际业务侧接入 MTEE 服务（见下）。

---

## IM 5.0 / 头像图片 / 内容合规 MTEE

### IM 5.0：昵称对齐

核心目标：**维持 IM 工具与阿里旺旺 IM 工具名字展示一致**。

- **展示淘宝旺旺昵称**：创建会话时取到用户对应的淘宝昵称，组装进"对话扩展信息"（创建会话/会话列表返回中携带），前端直接展示。
- **新增卖家昵称**：因千牛侧每个小二都可回复 IM 消息，昵称与"消息"相关而非"对话框"，故将 `senderNick` 放在**消息扩展**中，前端直接使用。
- **历史消息问题**：淘宝旺旺昵称仅在新创建会话生效，历史会话可能不展示（如需支持须单独开发获取旺旺昵称的接口）；卖家昵称历史消息按旧逻辑展示商家昵称，新消息用新方案。

### 头像 & 图片

- **头像获取接口**：
  - IM 应用：`com.alibaba.ovs.api.service.OvsImUserInfoService#getUserInfo(Long)`。
  - distributor 应用：`com.alibaba.ovs.panama.im.user.ImUserInfoService#getUserInfo(Long, String)`。
  - 返回字段：`avatar`、`shopPicUrl`、`snsNick`。
- **依赖**：客户端 `com.alibaba.ovs:panama-im-api`（1.0.6-SNAPSHOT）；调用地址经 **Halo**（`halogwp.admin.alibaba-inc.com`）申请，主体为"杭州阿里巴巴海外数字商业有限公司"。
- **图片处理**：图片消息通过文件上传实现。

### MTEE 内容合规

- **目标**：鉴别分销商发送内容是否涉及**色情、非法政治、垃圾、违禁**信息，实现绿网环境。接入点在"分销商发消息给商家"时序图的第 7 步。
- **鉴别方式**：
  - **同步鉴别**：同步得到结果，可能产生较大 RT（采用超时降级防止请求堆积）；内容安全平台 HSF 服务 RT 为毫秒级。
  - **异步鉴别**：不阻塞 RT，但可能收不到回调、且判定不通过时还需撤回/删除已发消息等后续操作。
- **方案对比与选型**：
  - **KFC（Keyword Filter Center，关键词过滤中心）**：仅文本关键词过滤，几乎无费用，**无法处理图片**。
  - **内容安全运营平台（新绿网）**：覆盖涉政/色情/暴恐/违禁/广告/灌水，支持文本+图片+音视频+文件，有费用。
  - **最终选择内容安全运营平台**（满足文本 + 图片鉴别的长期需求）。
- **HSF 接入实现**：
  - 依赖 `com.alibaba.security:tenant-common`（1.6.9.1）。
  - 消费服务 `com.alibaba.security.tenant.common.service.RequestService`，version `1.0.0_gjnraqcl`，`clientTimeout=3000`。
  - 调用 `hsfServ.request("gjnraqcl_ae_meta_sns_common", map)`，入参 map 含 `snsIMMap`（`havanaID`=集团用户 ID）等场景字段，返回 `{code, hasRisk}`。
- **稳定性保障**：关键节点日志、流量开关、异常监控、异常/超时兜底降级；IM 发送消息数量可监控可查看走势。
- **成本预估**（基于 IM 消息量 < 1 万/min）：文本 + 图片全量约 **91.98W/年**（发送口径）；**仅识别文本约 2.63W/年**。

> ⚠️ **内容分歧**：MTEE 成本在《IM 增加 MTEE 内容合规》中按发送/存储/累计多口径估算（全量约 91.98W/年），而《IM 安全计费》给出的"总费用 2.88w"是按更低扫描量（如国内文本 36 万次）测算的账单预估，两者量级差异来自消息量假设不同，引用时需注明口径。

### IM 安全计费

`ali.sec.content.*` 系列内容安全计费项（**总费用约 2.88w**）：

| 能力 | 计费码 | 单价 |
| --- | --- | --- |
| 国内文本识别 | `ali.sec.content.text.scan` | 0.01/千次 |
| 图片-涉政 | `ali.sec.content.politics.scan` | 0.06/千次 |
| 图片-涉黄 | `ali.sec.content.porn.scan` | 0.06/千次 |
| 图片-垃圾信息 | `ali.sec.content.antispam.scan` | 0.06/千次 |
| 图片-不良信息 | `ali.sec.content.live.scan` | 0.04/千次 |
| 图片-涉刀涉枪 | `ali.sec.content.terrorism.scan` | 0.04/千次 |
| 图片-特殊人群 | `ali.sec.content.crowd.scan` | 0.04/千次 |
| 图片-其他违禁 | `ali.sec.content.contraband.scan` | 0.04/千次 |
| 语音识别 | `ali.sec.content.voice.scan` | 0.0121 / 0.0062 |
| 视频识别 | `ali.sec.content.video.scan` | 0.1/千次 |

### IM 相关配置

- **分销商发送非合规内容次数上限**：MSE Diamond 配置 `dataId=security_content_limit_data_id`，`group=security_content_limit_group`，`namespaceId=ovs-pnm-im`；JSON 形如 `{"1211221": 18}`（userID → 允许非合规次数，超过即被限制）。

---

## IM 对外 API（免登内嵌）

面向外部系统（分销商自有系统）内嵌拉起 IM 会话框的开放能力。涉及应用：`ovs-pnm-account`、`ovs-pnm-open`、`ovs-pnm-distributor`。

- **方案对比**：
  - 方案一：内嵌页面手动登录。
  - 方案二：不依赖开放平台登录态，自定义 token（open api 以**加密方式透出淘宝卖家 sellerId**，前端按新的 userId 取值方式拉起对话框）。
  - **方案三（推荐）**：依赖开放平台登录态，系统**自动登录**——加载 IM 对话框前先自动登录再加载。
- **依赖国际会员账密登录**：`com.alibaba.global.user.biz.api.facade.UserBizLoginFacade#loginByPwd`（接入 guic 账密登录接口）；token 加解密、存储及有效期判断接入 KC。
- **对外接口**：
  - `ovs-pnm-distributor`（HTTP）：`/autoLogin?loginToken=...`（自动登录）。
  - `ovs-pnm-open`（open api）：`/page/link/get`（获取页面链接）。
  - 页面路由 `/apps/imchat` 与 `/open/imchat`（open 免登入口）指向同一页面；会话框链接携带加密 `sellerId` + `loginToken`。
- **已知问题**：同一浏览器下再次登录其他采购账号会冲突（以最新为准）。

---

## 消息链路升级与消息服务

### 链路重构（旧链路 → 新链路）

分销消息链路升级重新划分了职责：

- **`ovs-pnm-item`（分销商品消息中心）**：对接"货源"消息，聚合并发送"分销商品"相关消息。
- **`ovs-pnm-open`（分销商消息发送中心）**：面向分销商提供开放能力（**API + 消息**），承担防抖节流与分销商定向分发。
- **两套搜索引擎**：商品本身搜索（由 `ovs-pnm-xt` 同步 OpenSearch 数据）+ 品商关系搜索（暂由 `ovs-pnm-distributor` 同步，未来期望切掉/不自建）；品商关系变化时需同步更新。

### `ovs-pnm-item` 职责

- **货源消息接收**：TAG 按 `market_code` 过滤。
- **消息聚合组装**：统一分销商品消息模型 `PnmItemMsgDTO`，按 PRD 做消息映射与聚合（商品状态/信息/价格/库存变更、SKU 状态/信息变更、品商关系变更）。
- **分销商品消息发送**：见下"商品消息中心"章节的消息协议。

### `ovs-pnm-open` 职责

- **防抖节流**：相同消息类型下同一个品，在 x 秒/分内只向分销商推送最后一次消息。
- **分销商分发**：只向有品商关系的分销商发送消息（依赖品商关系搜索）。
- **后门能力【P2】**：消息订正、黑白名单等。

### 消息高可用

- 货源消息可查询、可对账：接收消息日志回流 ODPS，离线明细表（时间 + 商品 ID + 消息类型）。
- 消息发送统计（分销商维度）：发送日志离线回流，离线明细表（时间 + 分销商 ID + 商品 ID + 消息类型）。
- 监控项：MetaQ 固有监控 + 货源消息接收量/消费成功率 + 分销商消息发送量。

### 消息链路升级相关配置

- 开放平台新增消息 tag：在 iopconsole-tbgl 推送配置台（`/admin/api/index.htm#/api/push`）新增。

---

## 商品消息中心（ovs-pnm-item）

### 消息协议

二方库 `ovs-pnm-item-api` 提供消息实体类与解析方法。

| 消息类型 | TOPIC | Tag | Key |
| --- | --- | --- | --- |
| 商品状态变更 | `PANAMA_ITEM_UPDATE` | `ITEM_STATUS` | `${分销商品ID}_${TAG}` |
| 商品信息变更 | `PANAMA_ITEM_UPDATE` | `ITEM_INFO` | 同上 |
| 商品价格变更 | `PANAMA_ITEM_UPDATE` | `ITEM_PRICE` | 同上 |
| 商品库存变更 | `PANAMA_ITEM_UPDATE` | `ITEM_STOCK` | 同上 |
| SKU 状态变更 | `PANAMA_ITEM_UPDATE` | `SKU_STATUS` | 同上 |
| SKU 信息变更 | `PANAMA_ITEM_UPDATE` | `SKU_INFO` | 同上 |
| 品商关系变更 | `PANAMA_ITEM_RELATION_UPDATE` | `BIND` / `UNBIND` | `${BIND/UNBIND}_${分销商品ID}_${分销商ID}` |

### 消息体模型

- `ItemUpdateDTO`：`mpId`（商品 ID）、`type`（变更类型，见 `ItemUpdateType`）、`content`（变更内容，见 `ItemUpdateContent`）。
- `ItemRelationUpdateDTO`：`mpId`（分销商品 ID）、`distributorId`（分销商 ID）、`action`（`ItemRelationAction`）。

> ⚠️ **内容分歧**：《巴拿马分销消息链路升级》里 `ovs-pnm-item` 发送 TOPIC 记为 `PNM_ITEM_UPDATE` / `PNM_ITEM_RELATION_UPDATE`，而落地文档《分销商品消息中心(ovs-pnm-item)》里为 `PANAMA_ITEM_UPDATE` / `PANAMA_ITEM_RELATION_UPDATE`。以落地文档（`PANAMA_*`）为准，链路升级文档中的 `PNM_*` 应为早期草案命名。

### 变更消息量现状（参考）

2.22~3.14 期间总体消息量级：商品状态变更 271.8w、库存变更 8595w、价格变更 4034w、品商关系变更 116.3w；库存变更量最大。主要消费分销商为 KC、东森、Dsers、Verybuy——反映了防抖节流（尤其库存/价格高频变更）的必要性。

---

## MetaQ 消息工具（ovs-pnm-tools-starter）

分销侧沉淀的统一 MetaQ 收发封装，供各 `ovs-pnm-*` 应用复用。

- **接入**：parent 引入 `com.alibaba.ovs.panama:ovs-pnm-dependencies-bom`（**版本 ≥ 1.0.7**），module 引入 `ovs-pnm-tools-starter`。
- **发送方**：`@PnmMqProducer(producerBeanName, producerGroup, topic, tags)` 注入 `PnmMessageProducer`，调用 `send(messageBody)` / `send(messageKey, messageBody)`。
- **接收方**：类上加 `@PnmMqConsumer(consumerBeanName, consumerGroup, topic, tags)`，实现 `PnmMqConsumerHandler#consumeMessageHandle(MessageExt)`，返回 `PnmConsumerStatus`；`tags` 支持 `||` 多标签（如 `pnm-IM.MSG||pnm-IM.MS2`）。
- **环境隔离**：注解含 `dailyUnitName`(daily) / `preUnitName`(pre) / `unitName`(sh，生产) 单元名配置。
- 示例：`topic=OVS-PNM-DATA-TEST`、`tags=pnm-IM.MSG`、`producerGroup=PID-ovs-pnm-data-notification`。

---

## 开放平台消息推送（对外/ISV）

### 推送消息类型（ovs-pnm-open → 开放平台 → ISV）

对外推送消息统一 payload 结构：`{seller_id, message_type, data{...}, timestamp, site}`（`site` 如 `taobao_hk`）。`seller_id` 用于换取 AccessToken（refresh）推送。

| message_type | 含义 | data 关键字段 |
| --- | --- | --- |
| 11 | 商品状态变更 | `mp_id`、`distributor_id`、`status`（ON/OFF/DELETED） |
| 13 | 商品信息变更 | `mp_id`、`update_fields`（如 `ITEM_IMG`） |
| 15 | 商品价格变更 | `mp_id`、`sku_ids`、`distributor_id` |
| 16 | 商品库存变更 | `mp_id`、`sku_stocks`（`sku_id`、`old_value`、`new_value`） |
| 14 | SKU 状态变更 | `mp_id`、`sku_id`、`status`（ADDED/DELETED） |
| 17 | SKU 信息变更 | `mp_id`、`skus`（`sku_id` + `update_fields`，如 `SKU_IMG`/`SKU_ALIAS`） |
| 18 | 品商关系变更 | `mp_id`、`distributor_id`、`action`（BIND/UNBIND） |

（该"消息类型编号"是对外 ISV 契约，与 `ovs-pnm-item` 内部 MetaQ 的 TAG 命名是两套映射。）

### 线上推送异常复盘（2022-10/11）

商翔集团、Wegobuy 反馈订单相关消息（创单/支付成功）推送异常，根因两类：

| 问题 | 描述 | 影响 |
| --- | --- | --- |
| 请求 ISV 回调地址超时 | ISV 服务网络不畅，连接超时（Read timed out） | 低 |
| 消息延时消费 | 疑似 topic 消息积压，延迟约 1 小时才推送 | 高 |

- 处理方案：分销商兜底查询 + 平台侧主动重推。
- 保障预案：巴拿马侧与开放平台侧分别明确保障时间、预案与响应效率。
- 订单消息链路细节见 [[采购交易与履约链路.md]]。

---

## 已知缺口 / 待办

- IM 一期不支持千牛端感知分销商已读/未读。
- 品商关系搜索的数据同步暂留在 `ovs-pnm-distributor`，规划中期望切除自建。
- 新老消息链路切换的灰度策略在源文档中标注为 TODO。
- 部分文档（IM 三期、接入 SOP、发布计划、消息发送明细表）为流程/自测/数据类，未纳入本页设计细节综述。

---

## See Also

- [[巴拿马跨境分销业务与产品总览.md]]
- [[采购交易与履约链路.md]]
- [[佣金结算与资损防控.md]]
- [[商品域·铺货·选品与搜索.md]]
- [[账号体系与开放平台.md]]
- [[限流与服务治理.md]]
- [[技术架构与研发规范.md]]
- [[安全生产与稳定性保障.md]]
- [[AI能力建设.md]]
- [[日本站与自营独立站.md]]
