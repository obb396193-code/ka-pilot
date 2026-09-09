# 发给内网 agent 的实证指令（直接复制）

> 2026-08-17。目的：功能全景 v2 已定稿，开工前把所有 🤖 功能共同依赖的"写链路"和四个待证事实一次验完。
> 回收后结果反写 05/09/17 号文档，🤖 功能解锁进开发。

```
你好。产品功能设计已定稿，开工写代码前需要你实证五件事。前四件是只读/低风险探测，第五件涉及创建 autopilot（可控范围）。请实际跑命令，贴命令和原始输出（凭证打码保留字段名）。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
一、写链路最小闭环（最重要，决定一半功能能不能做）

我们的产品要从 FaaS 侧程序化触发沙箱内的 agent 执行任务并拿回结构化结果。请按顺序验证：

1. 创建一个测试 autopilot（create_issue 模式）：
   multica autopilot create --title "写链路实证" --description "<见下面的任务prompt>" --agent <你自己> --mode create_issue --output json
   任务 prompt 写：「这是一次链路测试。请把你收到的本次触发的完整上下文（尤其是 webhook POST body 里的内容有没有出现在你的上下文里）原样写进 issue 评论，格式：RESULT_JSON: 后跟一行 JSON，包含 {received_payload: <你看到的payload内容或"none">, timestamp: <当前时间>}。不要执行任何其他操作。」

2. 给它挂 webhook trigger：
   multica autopilot trigger-add <id> --kind webhook --label "test" --output json
   拿到 webhook URL 后，用 curl POST 一个带 JSON body 的请求：
   curl -X POST <webhook-url> -H "Content-Type: application/json" -d '{"test_key":"test_value_12345","action":"probe"}'

3. 等 run 完成，查看生成的 issue 和评论，回答：
   a. webhook 的 POST body（test_value_12345）有没有出现在 agent 收到的上下文里？（这决定我们能不能动态传参，还是只能靠固定 prompt）
   b. agent 按格式写的 RESULT_JSON 评论，外部能不能稳定读到？用什么身份读？（这引出第二件事）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
二、外部读取 issue 的凭证（mcn_ 令牌存废之争）

之前两个会话给了矛盾答案：一个说有 mcn_（Cloud Node PAT，给外部服务用），一个说 multica auth 里查无此物。请实测：
4. multica login --help 和 multica auth 相关子命令的完整输出——有没有生成/管理长期 token 的方式？
5. 如果有：怎么申请一个？有效期多久？
6. 如果没有：外部服务（我们的 FaaS 应用）要定期读 Multica issue 评论，现实可行的鉴权方式是什么？（提示：我们此前的钉钉网关在 FaaS 里用过 bin/multica 二进制+某种令牌成功建过 issue——如果你能查到那个应用 a1-client-faas-c1yopum3 的 config vars 里 MULTICA_TOKEN 的前缀形态（只要前缀 mul_/mcn_/mat_，不要值），这就是最直接的证据）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
三、LLM 通路（产品内 Agent 功能的前置）

我们的 FaaS 应用需要自己调用 LLM API（对话分析、报表生成，要秒级响应，不走 Multica）：
7. 内网有什么可用的 LLM API 服务？（whale/idealab/内部模型网关？）给接入方式和申请路径。
8. 从 FaaS daily 环境 curl 一下该服务的端点，验证网络通不通。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
四、Devix 沙箱做值守常驻的可行性

我们看到消费者认知团队在 Devix 上跑了 7x24 常驻 Flask + 公网中转 + 钉钉回调的运维 Agent。我们想用类似模式跑值守组件（监控轮询/诊断触发）：
9. 我们的 Devix 权限能不能建一个常驻 Sandbox 跑长期服务？和跑一次性 agent 任务的区别是什么？申请/配置路径？
10. Devix Sandbox 里能不能访问 qh.alibaba-inc.com（启航 get_data）？（大概率能，因为 agent 本来就在调，但请确认常驻服务模式下也一样）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
五、kuaishou-cli 结构同步（补数据维度）

我们的数据接口只有账户+广告两层，产品需要计划/单元维度（垃圾计划清理功能）：
11. 在沙箱里实际跑：kuaishou-cli campaign list --advertiser-id <任一测试账户> --page 1 --page-size 10，贴返回的 JSON 结构（数值可打码，字段名保留）。
12. 同样跑 unit list，贴结构。确认返回里有没有 campaign_id/unit_id 与 ad 层的关联字段。
13. 跑 kuaishou-cli account fund --advertiser-id <同上>，贴余额字段结构。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
六、FaaS→钉钉公网出网（你之前设计里自己标注"没测过"的那条）

14. 从 FaaS daily 环境 curl 钉钉开放平台 API（api.dingtalk.com 或 oapi.dingtalk.com），贴 HTTP 状态码——验证钉钉推送能不能直接从 FaaS 发（我们的钉钉网关之前在 FaaS 上跑通过 Stream 长连接，理论上出网是通的，但请再确认一次 REST API 方向）。

请按编号回答。最关键的是 3a（传参）、6（外部读取凭证）、7（LLM 通路）。
```

## 回收（待贴）
