# B22 IdeaLab ASR Provider 设计

> 日期：2026-08-21  
> 状态：老板已选择方案 A，待实现  
> 范围：只新增 Worker 内部 Provider、音频提取和可选真实烟测；不改公开 Contract、数据库、生产任务入口或前端

## 1. 已验证事实

- 真实端点：`POST https://idealab.alibaba-inc.com/api/openai/v1/audio/transcriptions`。
- 鉴权：`Authorization: Bearer <IDEALAB_AK>`。
- multipart 参数：音频文件、`model=whisper`、`response_format=json`。
- MP4 直传返回 HTTP 400 / `CE-009`；16kHz 单声道 WAV 真实成功。
- 成功响应为 `{ text, usage }`，没有 language、duration 或时间戳。
- 20.8 秒 WAV 样本耗时 3.4 秒；这只是样本，不是 SLA。
- IdeaLab 不支持 `timestamp_granularities`。B15 已支持 `timingPrecision=whole_video`，不得伪造句级时间轴。

## 2. 方案选择

选择独立的 `IdeaLabAsrTransport + FfmpegWavExtractor`，继续复用 B15 的 `WholeTextCloudAsrAdapter`。

没有选择：

- 把 HTTP、FFmpeg 和文本解析都写进现有 Adapter：职责混杂，无法独立测试资源清理、错误分类和 Provider 替换。
- 新建独立 ASR FaaS：现有 Worker 已具备 FFmpeg、HTTPS 和任务临时目录，多一层服务没有当前收益。
- 直接接生产拆片任务：生产 Job/API/凭证归属尚未冻结，本批不得越过 Claude/arch 契约门。

## 3. 数据流

1. `FfmpegWavExtractor` 接收 Worker 内部媒体文件句柄。
2. 在同一受控任务目录内生成随机命名的临时 WAV：PCM 16-bit、16kHz、单声道、无视频流。
3. 提取完成后校验文件是普通文件、不是符号链接、非空且不超过本地可配置字节预算。
4. `IdeaLabAsrTransport` 用 multipart POST 上传 WAV，固定 `model=whisper`、`response_format=json`。
5. Transport 严格解析 `{text, usage}`，只把 `{text}` 交给 B15 Adapter；usage 通过独立观测回调输出数值，不进入 Agent 业务证据。
6. Adapter 生成 `kind=whole_text`，Domain 映射为覆盖完整视频时长的唯一 segment，`timingPrecision=whole_video`。
7. 无论成功或失败，WAV 都必须清理；不得删除原视频。

## 4. 配置与安全

- API Key 只允许从构造参数/Worker 环境注入，不进入日志、错误、领域对象或检查点。
- 默认 endpoint 固定为已验证 HTTPS 地址；自定义 endpoint 只允许显式配置的 `https:` URL，不跟随任意重定向。
- 默认不启用真实调用。opt-in 烟测必须同时显式提供开关、AK 和本地测试音频路径。
- 超时、最大 WAV 字节数、最大响应字节数均可配置且必须为正整数。
- 5MB 只作为候选默认本地护栏，不标注为平台上限；真实平台上限仍未验证。
- Provider 错误不得携带 response body、媒体路径、Authorization 或原始 cause。

## 5. 错误与重试语义

Transport 只分类，不在内部自行重试：

| 类别 | 条件 | 建议任务层动作 |
|---|---|---|
| `invalid_input` | WAV 提取失败、空文件、超本地预算 | 不重试，修输入/配置 |
| `auth_failed` | HTTP 401/403 | 阻断凭证，不重试 |
| `invalid_request` | HTTP 400、`CE-009` 或其他确定参数错误 | 不重试 |
| `rate_limited` | HTTP 429 | 按任务层退避重试 |
| `retryable_transport` | 网络错误、超时、HTTP 5xx | 按任务层有限重试 |
| `invalid_response` | 成功响应超预算或 Schema 漂移 | 停止并告警，不盲重试 |

现有 `WholeTextCloudAsrAdapter` 仍把 Transport 失败收敛为安全的 `transport_failed`；详细分类只供 Worker 运行层观测和未来 Job 策略使用。

## 6. 低文本密度

- 文本只要非空且合法，即视为 ASR 成功；不能因为只有几个字就判 Provider 失败。
- 本批只产出可观测的文本字符数，不发明“口播充分”的业务阈值。
- 后续产品可在契约冻结后用版本化阈值显示“低文本密度”，同时以关键帧/镜头证据为主；不得从短文本推断素材质量差。

## 7. 测试边界

- 单元测试：FFmpeg 参数、路径/符号链接/字节门、清理；multipart 字段、鉴权、超时、响应预算、错误分类、usage 观测、脱敏。
- 集成测试：使用本机 FFmpeg 生成/提取短 WAV，不访问网络。
- opt-in 真实测试：只在显式环境变量齐全时运行一次 IdeaLab 请求，默认测试套件不消耗额度。
- 全量门禁：Worker/Domain/DB/DingTalk tests、typecheck、lint、audit、真实 PG/migration、现有 gateway/FFmpeg 烟测。

## 8. 非目标

- 不测试或承诺 mp3/m4a/webm。
- 不宣称 IdeaLab 文件大小、时长、限流或 SLA。
- 不做本地 ASR、OCR 字幕或句级时间戳对齐。
- 不新增 DB 表、公开 API、前端页面或生产部署配置。

