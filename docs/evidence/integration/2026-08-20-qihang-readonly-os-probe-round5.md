# 奇航/素材/承接页第五轮只读 OS 探针

> 日期：2026-08-20
> 来源：老板转交的内网 OS Agent 回传
> 性质：全部为只读调用、源码/帮助文档核对；未执行链接生成或其他写操作。
> 脱敏：不保留真实 userId、账户/任务/广告组/素材/商品标识、金额、考核价、页面编号、完整 URL 或凭证。

## 1. 分级结论

### 真实执行确认

- `qihang-ks-cli kuaishou-task get --task-id` 可读取任务级 `business_type`、RTA、考核价、返点、承接页、商品上下文和人工备注。
- `qihang-cli material count --media --pool-ids` 可执行；用任务承接页相关编号探测时成功返回空对象，证明这些编号不能直接当有数据的素材池 ID。
- 抽样广告组均返回 `unit.url`、`unit.schema_uri`、`unit.web_uri_type`：URL 是星链唤端中转 H5，公网 HEAD/GET 成功；schema 是 `tbopen` 端上协议。
- 素材 URL 对同一素材间隔数分钟重复查询时哈希不同，说明每次查询会重新签发；不能把 URL 作为稳定资产长期缓存。
- 现有账户样本的广告组商品字段存在但为空，不能据此建立商品主数据。

### 源码/帮助文档确认

- 素材明细支持已知 `pool_id + item_id` 后读取素材签名、类型、正文 URL、封面/商品图和尺寸；无素材池列表/发现接口。
- 文案池需要已知 `text_pool_id`；该 ID 同样没有发现接口。
- `link build` 可按任务、承接页与商品输入生成 click/exposure URL，但没有只读回查接口；本轮未执行生成。
- qihang/kuaishou CLI 均不存在商品 list/detail/search；标题、类目、库存、店铺、SKU 没有当前数据源。
- 所有已读 Skill/connector 无独立字幕、ASR、caption、transcript 接口；建广告流程中的 captions 实际指文案池，不是视频字幕。
- IdeaLab Audio/Whisper 可对文件做 `whisper-1` transcription，但已知通路只返回 JSON 文本，不提供 segment/word timestamp；本轮未携带真实文件执行。

### 尚未验证

- 素材签名 URL 的真实 TTL；短时间查询变化只证明重新签发，不等于知道过期时间。
- 产品 FaaS 对真实素材 CDN 的直接下载；现有 FaaS 没有通用 URL 探针，本轮按约定不新增端点。
- IdeaLab Whisper 的真实文件上传、格式/大小限制、时延、配额和错误响应。
- `tbopen` 在真实手机端是否成功唤起、失败回退行为和最终业务页面。

## 2. 产品影响

1. 任务配置中心可接任务级考核价、返点、RTA、承接页和商品描述，并保留来源与更新时间。
2. 承接链诊断可做 H5 可达性与 task/unit 配置一致性；服务端不能把 H5 200 等同为手机端唤起成功。
3. 商品素材拆片仍缺素材池发现。短期只能由用户/Agent维护 `pool_id/text_pool_id` 后验证和使用，不能宣称已具备商品库。
4. 素材 URL 必须即取即用：持久化稳定来源引用、素材签名/内容 SHA，自身 URL 只存在于同一执行租约内。
5. 平台字幕路径当前不可用。老板裁决一期先用 IdeaLab 单次整段 ASR 做诊断，不为细时间轴增加多次调用；输出必须标记无句级时间戳。

## 3. 与前轮的修正

- 第四轮“素材明细能力可用”补充关键前提：pool/item 输入不可发现，当前实际是有查询能力但缺入口标识。
- 第四轮“拿到 URL 后产品 Worker 下载”修正为“拿到后立即下载”；失败重试必须重新获取 URL。
- B13“平台字幕优先”保留为可替换未来能力，但快手/奇航当前真实默认路径改为云 ASR。
- 不改变前三轮 realtime/offline、hh 累计和 2000 行静默截断结论。

