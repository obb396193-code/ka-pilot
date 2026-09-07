# 📊 Episode 状态机与流转逻辑

`tb_episode` 的 `stat` 字段是驱动整个系统自动流转的“齿轮”。了解状态变更时机对于排查卡死问题至关重要。

## EpisodeStatEnum 状态流转图

```mermaid
stateDiagram-v2
    [*] --> 10_Init: 剧集录入
    10_Init --> 20_GlobalEntity: 实体生成完成
    20_GlobalEntity --> 40_ShotScript: 分镜脚本生成完成
    40_ShotScript --> 60_ShotPic: 分镜图片全部生成完成
    60_ShotPic --> 70_ShotVideo: 分镜视频全部生成完成
    70_ShotVideo --> 80_VideoGen: 开始视频合成
    80_VideoGen --> 90_Done: 视频合成完成
    
    10_Init --> 22_GlobalEntityFail: 实体生成失败
    20_GlobalEntity --> 42_ShotScriptFail: 脚本生成失败
    40_ShotScript --> 62_ShotPicFail: 图片生成失败
    60_ShotPic --> 72_ShotVideoFail: 视频生成失败
    80_VideoGen --> 82_VideoFail: 合成失败
```

## 关键字段说明
- **stat (int)**: 主状态码，由各个 Workflow 执行节点更新。
- **tts_stat (int)**: 独立控制 TTS 流程的状态（0-处理中, 1-已完成）。
- **subtitle_erase_stat (int)**: (新增) 控制字幕擦除进度的状态。

## 任务重试逻辑
大部分状态变更都由 `tb_task` 的完成事件触发。如果 `stat` 停留在某个 Fail 状态，通常需要检查：
1.  `tb_task` 中是否有 `FAILED` 状态的任务。
2.  后端 Scheduler 是否正在轮询该状态对应的任务类型。