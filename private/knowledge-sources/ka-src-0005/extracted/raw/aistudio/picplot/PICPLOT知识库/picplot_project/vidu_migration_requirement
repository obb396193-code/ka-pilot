# 生成分镜视频接入 vidu (迁移需求)

## 背景
- `picplot-web` 是一个 SpringBoot 服务，要改造成 Python 服务，对应工程是 `picplot`。
- 目前的 `picplot` 是根据 `picplot-web` 的 `feature/move_copy` 分支改造来的。
- `picplot-web` 的 `master` 分支相比于 `feature/move_copy` 分支新增了 **vidu 生成视频功能**，需要将此功能迁移至 Python 版 `picplot`。

## 需求详情
1. **逻辑梳理**:
   - 梳理 `picplot-web` master 分支新增的 vidu 实现细节。
   - 包括 `LmSvcVidu` 类的具体实现。
   - `PicPlotSvcImpl.genShotVideo` 接口中根据 platform 判断 vidu 的逻辑。
   - `multiRef`（多参考图）功能的实现。
2. **技术方案**:
   - 参考 `picplot` 现有风格。
   - 使用 NexusFlow 的 `ViduImage2VideoNode` 接入 vidu。
   - 参数组装逻辑放入 `VideoParamHandleNode`。
   - `vidu` 和 `WanVideoGenerationNode` 均需支持 `multiRef`。
3. **开发实施**:
   - 在 `picplot` 工程拉取新分支实现方案。

## 开发要求
- 功能与逻辑梳理必须全面，严禁遗漏。
- 代码风格必须严谨参考 Python 版 `picplot`。
- 生成详细的任务清单（Task List），每项完成后需进行测试验证。
- **强制要求**: 以上 3 个步骤每步完成后需生成文档，并经人工确认后再继续。