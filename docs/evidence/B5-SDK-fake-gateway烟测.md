# B5 Claude Agent SDK → 本地协议网关烟测

> 日期：2026-08-19  
> 性质：本机 fake upstream 集成证据，不代表 IdeaLab、Anthropic 或 Multica 生产联调通过。

## 结论

真实 `@anthropic-ai/claude-agent-sdk@0.3.235` 子进程已成功经过本地 `@the-next-ai/ai-gateway@1.0.17` sidecar 调用 fake OpenAI Chat Completions 上游，并收到 partial text delta 与最终 result。第二次真实 SDK 运行在总超时到达后返回 `timeout`，query handle 被关闭。

## 实际链路

```text
Claude Agent SDK query() 子进程
  → localhost /v1/messages
  → AI Gateway Anthropic source adapter
  → KA 短时凭证信封插件
  → OpenAI Chat Completions target adapter
  → fake upstream /v1/chat/completions
  → OpenAI SSE
  → Anthropic partial stream
  → SDK stream_event + result
```

## 验证命令与结果

```bash
KA_RUN_AGENT_SDK_SMOKE=1 npm test -- --run test/agent/sdk-gateway-smoke.test.ts
```

结果：1 test passed。验证项：

- SDK 使用真实 `query()` 实现，而非 `QueryFactory` mock。
- 子进程收到的 Provider 凭证是 `kae1` 短时加密信封；fake 上游收到解密后的 Bearer key。
- `x-ka-*`、gateway client key 和信封头未透传到 fake 上游。
- OpenAI SSE 文本被转换为 SDK `delta` 事件，最终 result 为 `SDK gateway smoke passed.`。
- 第二次真实 SDK 运行在 1 秒总超时后返回 `outcome=error, code=timeout`。
- 全程未使用真实公司账户、真实模型 AK、Multica token 或公网模型服务。

## 尚未证明

- IdeaLab 当前模型对 Claude Code system/tool/structured-output 语义的真实兼容性。
- Anthropic 官方生产 API、真实费用与限流错误映射。
- Multica/OS 的真实任务请求、回执、取消、重连和运行日志协议。
- 高并发、长时间运行、真实网络抖动及 sidecar 进程托管策略。

这些项需真实 Secret 服务、内网环境和 P-008 契约裁决后再做，不用 fake 结果替代。
