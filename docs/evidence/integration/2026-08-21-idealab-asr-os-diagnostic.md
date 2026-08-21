# IdeaLab ASR OS 诊断实证

> 日期：2026-08-21  
> 来源：内网 OS Agent 只读/诊断回传  
> 性质：2 次真实 ASR 调用（1 次格式失败定位 + 1 次纠正成功）；未回传 AK、真实路径、完整素材或转写正文。  
> 边界：证明 OS 环境中的 Provider 契约，不等于 KA Worker/FaaS 已用产品身份完成真实烟测。

## 1. 已真实执行确认

| 项 | 结论 |
|---|---|
| Endpoint | `POST https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions` |
| 协议 | OpenAI 兼容 multipart；`Authorization: Bearer <AK>` |
| 模型参数 | `model=whisper`；平台模型为 Azure OpenAI `whisper-1` |
| 响应格式 | `response_format=json`；响应顶层为 `{text,usage}` |
| 输入 | MP4 直传返回 HTTP 400 / `CE-009`；FFmpeg 提取的 WAV 16kHz 单声道成功 |
| 成功样本 | 20.8 秒、约 650KB WAV，HTTP 200，端到端约 3.4 秒 |
| 时间信息 | 无 language、duration、segment/word timestamp；产品精度只能标 `whole_video` |
| usage | 数字字段为 `prompt_tokens`、`completion_tokens`、`total_tokens`、`cacheReadInputTokensCompatible` |

失败响应是五字段 envelope：`success/code/message/data/detailMessage`。本次只保留错误码与类别，不保留原始路径或凭证。

## 2. 产品实现边界

- 一条视频只调用一次 ASR；不切音频、不做本地 ASR、不等待时间戳能力。
- 先用 FFmpeg 提取 PCM s16le、16kHz、单声道 WAV，再 multipart 上传。
- MP4 直传和 `CE-009` 属非重试输入错误；网络/5xx 才进入上层受控重试候选。
- 整段文本用于提示词驱动的文稿拆片；逐镜头关键帧墙来自独立 FFmpeg 管线，两者不伪造逐句时间对齐。
- 20.8 秒→3.4 秒只是一条样本，不是性能 SLA。5MB 软上限与 `max(30s, 3×音频时长)` 是产品保护建议，不是 Provider 已证实硬限制。
- 本批没有验证 mp3/m4a/webm、长音频上限、限流、配额、费用和数据保留。

## 3. 对 B22 的输入

- Provider endpoint、host/path、multipart 字段和 model 被固定校验。
- API Key 只从环境/未来 Secret reference 进入请求，不序列化进配置日志。
- Provider `{text,usage}` 在 Transport 归一为 `{text}`；usage 只进无正文观测，Domain 继续输出 `whole_text`。
- 默认关闭，不接生产 Job/API；真实产品身份烟测只允许显式 opt-in。
