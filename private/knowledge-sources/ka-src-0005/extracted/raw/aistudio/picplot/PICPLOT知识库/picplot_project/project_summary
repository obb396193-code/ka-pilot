# PICPLOT (PP) 项目梳理总结

## 1. 项目概览
**PICPLOT (PP)** 是一个基于 AI 技术的自动化短视频/剧集生成平台。它能够将小说文案或脚本通过一系列复杂的 AI 工作流，自动转化为包含角色一致性、分镜配音、分镜视频及最终合成字幕的视频作品。

- **核心语言**: Python 3.10
- **核心框架**: FastAPI (Web接口), NexusFlow (工作流引擎)
- **部署环境**: Docker + Aone (阿里内部部署)
- **关键路径**: `/Users/liuxiansheng/work/ai-code/openclaw/picplot`

## 2. 核心架构设计
项目采用了分层架构（DDD 思想）结合异步任务调度系统的设计：

### 2.1 逻辑分层
- **Interfaces (接口层)**: 提供 RESTful 接口，包含合集、剧集、任务、风格配置等路由。
- **Application (应用层)**: 封装业务服务逻辑（Services），协调领域对象完成任务。
- **Domain (领域层)**: 定义核心业务实体（Entities）、模型（Models）和值对象（VO）。
- **Infrastructure (基础设施层)**: 提供数据库访问（MySQL/Redis）、认证（BUC SSO）、存储（OSS）、音视频处理（ICE）等底层能力。
- **Node (工作流节点)**: 基于 NexusFlow 定义的具体原子操作节点，如 LLM 调用、生图节点、TTS 节点等。
- **Workflow (工作流层)**: 定义了从录入到合成的完整业务链路。

### 2.2 任务调度系统 (`src/app/scheduler`)
项目内置了多个常驻调度器，负责异步轮询并处理各类生产任务：
- 图片任务调度 (`start_image_scheduler`)
- 视频任务调度 (`start_video_scheduler`)
- TTS 任务调度 (`start_tts_scheduler`)
- 视频合成调度 (`start_merge_video_scheduler`)
- **字幕擦除调度** (`start_subtitle_remove_scheduler`) —— **新增功能**

## 3. 业务主流程 (7+1 阶段)
视频生产被划分为以下核心工作流：

1. **剧集录入** (`submit_episodes_workflow`): 校验参数，初始化合集和剧集基础数据。
2. **实体抽取** (`novel_entity_workflow`): 利用 LLM 提取角色、场景、道具，并生成初步参考图和分配音色。
3. **分镜脚本生成** (`shot_script_workflow`): 文案切割 -> 视频脚本 -> 配音脚本 -> 图片脚本 -> 实体提取。
4. **分镜图生成** (`shot_pic_workflow`): 根据提示词生成 4 张图片，通过 Qwen-VL 模型评测选出最优解。
5. **TTS 语音合成** (`tts_workflow`): 按角色分组，调用讯飞、呱呱或 MiniMax 生成分镜配音音频。
6. **分镜视频生成** (`shot_video_workflow`): 使用百炼（Wan2.6）或 Vidu 平台进行图生视频或多参考视频生成。
7. **字幕擦除 (最新集成)** (`subtitle_erase_workflow`): 对生成的视频片段进行字幕检测与背景擦除。
8. **视频最终合成** (`re_video_workflow`): 调用阿里云 ICE 服务，将视频轨、音频轨、字幕轨及 BGM 融合成片。

## 4. 关键技术栈
- **大语言模型**: Qwen3-Max, GPT-5.1, Gemini-2.5-Pro (用于脚本编写、实体提取、质量评测)。
- **多模态模型**: 通义万相 (生图), Seedream (生图), Wan2.6 (视频), Vidu (视频)。
- **云服务**: 
  - **OSS**: 存储所有的图片、音频、视频中间产物及成片。
  - **ICE**: 阿里云智能媒体服务，负责高性能的视频剪辑与渲染合成。
- **中间件**:
  - **MySQL**: 存储核心业务状态（Style, Coll, Episode, Shot, Task）。
  - **Redis**: 负责限流、分布式锁及简单的缓存任务。
  - **Kafka**: 处理异步消息通讯。

## 5. 项目关键配置
- **环境配置**: `application-local.yml` (本地), `application-testing.yml` (测试)。
- **认证系统**: 集成阿里巴巴 BUC SSO。
- **运行控制**: 
  - 本地: `local_gunicorn_restart.sh` 或 PyCharm FastAPI Run 配置。
  - 生产: `APP-META` 目录下的定制化启动脚本。

## 6. 当前开发重点 (近期变更)
- 引入了 `subtitle_erase_stat` 状态追踪。
- 在分镜视频生成工作流中集成了 `SubtitleDetectNode` 和 `SubtitleEraseNode`。
- 完善了基于 `subtitle_remove_scheduler` 的异步擦除任务闭环。