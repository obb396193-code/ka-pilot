# 多用户常驻 Runtime 直接执行器设计

> 日期：2026-08-24
> 状态：老板已确认方向；等待取得外部 `dingtalk-bot-migrate.tar.gz` 后做源码级核验。
> 适用范围：KA 投放经营平台的钉钉入口、产品内 Agent、媒体读写执行通路和用户凭证接入。

## 1. 背景与证据边界

老板提供了一套已有人使用的钉钉机器人 SOP。其描述的运行方式是：在能访问外网与阿里内网的沙箱中初始化巨浪/Multica Runtime，启动 `multica daemon`，运行常驻 Claude Agent，通过本机 MITM、CA 和个人身份字段调用启航与媒体接口。

当前只拿到 SOP 文本和 OS 对其机制的解释，**尚未取得或实读附件源码包**。因此本设计只把以下内容视为材料所声称的能力，不把它们冒充为本项目已验证事实：

- `bot.py` 的常驻会话、FIFO 和重置行为；
- `tools.py` 的媒体覆盖范围；
- `deduct.py` 的真实 endpoint、媒体范围和确认逻辑；
- `tt.sh` 的命令、代理头、错误处理和幂等语义；
- 普通 FaaS 是否拥有同样的本机 MITM、CA 与身份注入能力。

根据 SOP 中的 `runtime-init`、`mul_` 登录、`multica daemon`、`127.0.0.1:18082` 和 `/opt/mitm-ca/ca.crt`，当前高置信判断是：该机器人没有经过 Multica issue/对话/Autopilot 派发层，但仍依赖 Multica/OS 管理的 Agent Runtime、网络和代理授权层。

## 2. 老板已确认的产品目标

KA 平台最终应具备自己的直接读写能力。Multica/OS 是一期可用执行 Provider 与故障兜底，不应成为永久唯一入口。

与单人机器人不同，KA 平台服务多名用户：每个用户登录平台后绑定或授权自己的身份与凭证；谁发起操作，就使用谁的账户范围和授权快照执行，不能让全群操作都记到某一个机器人所有者名下。

## 3. 方案比较与裁决

### 方案 A：所有操作继续走 Multica Run

优点是复用现有 Skill、CLI 和沙箱权限；缺点是异步、延迟高、依赖 issue/对话/Run 模型，产品难以稳定拿到结构化执行状态。

### 方案 B：把外部单人机器人整体搬进平台

优点是实现快；缺点是一个常驻 Agent 持有全套个人权限、共享会话与共享 `CLAUDE.md`，无法满足多人身份、最小权限、可靠队列和审计要求。

### 方案 C：产品控制面 + 可插拔执行器（已选）

平台负责身份、账户范围、变更集、确认、幂等、审计和效果回收；实际读写交给统一 Capability Registry 后面的多个执行器：

```text
Web / 钉钉 / 工作流 / 内置 Agent
                ↓
KA Product API + Job/Outbox
身份、范围、风险、确认、幂等、审计
                ↓
Capability Registry
├─ ProductDirectExecutor   产品可正式直连的数据/API
├─ RuntimeExecutor         常驻于 Multica/OS Runtime，直接调用 CLI/MITM
└─ MulticaRunExecutor      issue/webhook/Agent Run 兜底
                ↓
结构化结果 → 运行记录 → 回执 → T+1 效果回收
```

这允许一期借用 Multica Runtime 的既有权限，同时不把产品耦合到 Multica 对话形态；将来取得正式服务身份后，可把能力逐项切换到 ProductDirectExecutor，而不改前端按钮、钉钉卡片或工作流节点。

## 4. 用户登录与凭证模型

用户通过平台身份登录后进入“集成与通知 → 接入管理”，完成自己的授权档案。平台数据库不保存可直接使用的明文凭证，只保存 Secret reference、元数据、作用域和验证状态。

授权档案按 `用户 × 渠道 × 执行后端` 建模，不假设一套凭证全渠道通用：

| 类别 | 可能字段 | 用途 | 当前证据 |
|---|---|---|---|
| 启航数据身份 | qihang/mozi userId | 查数和账户范围 | 已有项目实证，但各媒体资源仍逐项验收 |
| Multica 身份 | `mul_` PAT reference | 派发 Run、读取回执、Runtime 登录 | 已有项目实证 |
| 内部模型 | IdeaLab AK reference | 产品内 Agent/ASR | 已有项目实证 |
| Runtime 写身份 | avatar/user/bucNo 或平台后续提供的授权包 | MITM 代理注入媒体写权限 | 仅 SOP/OS 材料，待源码和真实 Runtime 核验 |
| 正式服务身份 | OAuth/API Key/服务账号 reference | 最终产品自有直连 | 路线图目标，尚未取得 |

每个授权档案必须展示：渠道、账户作用域、可读能力、可写能力、执行后端、最后验证时间、失效原因和撤销入口。后台 Job 固定 `credential_owner_user_id + initiator_user_id + workspace_id + 授权快照`；重试不得更换凭证所有人。

## 5. 通用能力与字节专属能力

### 可以抽象为跨渠道公共能力

- 钉钉 Stream 连接、断线重连和群消息接收；
- 常驻 Agent/Worker、暖会话和健康检查；
- 产品签名的结构化指令协议；
- 身份映射、Secret reference、账户作用域校验；
- Capability Registry、执行器路由、超时和错误分类；
- 变更集、dry-run、确认、幂等、锁、审计、回执和效果回收；
- 方法型知识沉淀，但必须进入有版本和范围的知识库草稿，不能由群消息直接改共享系统提示词。

### 明确是字节/巨量专属

- `tt.sh` 的预算、出价、启停、余额命令；
- 巨量侧 target/ad/account 字段和错误码；
- 字节渠道的规则拦截及其澄清行为；
- 文档中以 `TOUTIAO` 为媒体参数的查询示例。

### 仍待源码核验，不能先说通用

- `tools.py` 是否只是把 `media` 作为参数，还是写死字节 resource/字段；
- `deduct.py` 的启航扣量 endpoint 是否跨媒体、不同媒体 payload 是否一致；
- MITM `Proxy-Authorization` 三件套是否对快手、腾讯、百度同样有效；
- `multica daemon` 停止后本机 MITM 是否仍存在；
- 普通 Devix/FaaS 能否获得相同 Runtime 权限；
- 直接执行的审计最终落在哪一层、显示哪个操作者。

结论：借鉴的是执行节点模式和公共控制协议，不直接复用字节命令作为全渠道实现。每个渠道都实现独立 Adapter，并在 Capability Registry 中声明 `supported/read/write/dry_run/runtime_verified`。

## 6. Runtime Executor 安全边界

Runtime Executor 是独立特权部署单元，不与 DingTalk Gateway 或 Web/API 同进程。它不接受任意自然语言和任意 Shell，只接受产品签名、Schema 校验通过且在白名单中的结构化能力请求。

写请求至少包含：

- capability code/version；
- workspace、发起人、凭证所有人；
- 渠道、账户和对象范围；
- 参数及变更集 ID；
- dry-run 或 execute 阶段；
- 一次性确认凭证；
- idempotency key、过期时间和 trace ID。

Runtime Executor 必须拒绝：过期确认、账户越界、能力未启用、Schema 不匹配、重复冲突、无 dry-run 证据的受控写请求、任意命令和任意 URL。所有结果返回固定 envelope，不把凭证、代理头、完整环境变量或原始敏感日志回传产品。

## 7. 与现有产品的关系

- DingTalk Gateway 仍独立部署，只做 Stream、身份/意图、卡片、推送和产品 API；不持有媒体高权限。
- 明确查数与创建任务优先走产品 API；复杂分析交给内置 Agent；真正媒体读写交给执行器。
- 所有页面按钮、钉钉卡片、工作流节点和 Agent 建议调用同一 Capability Registry。
- MulticaRunExecutor 保留为复杂 Skill 和故障兜底；RuntimeExecutor 成熟后可成为主要写通路。
- 产品一级导航不变；新增内容落在“集成与通知 → 接入管理/消息记录”和“自动化 → 操作工具箱/运行中心”。

## 8. 验收门

1. 取得并只读实审 `dingtalk-bot-migrate.tar.gz`，形成逐文件复用/重写/拒绝清单。
2. 在授权测试身份下确认 Runtime 生命周期、MITM 来源、停止 daemon 后行为和审计归属。
3. 至少对字节、快手各选一个只读和一个可恢复低风险写能力，验证渠道 Adapter 不能混用。
4. 钉钉用户、平台用户、凭证所有人和媒体审计操作人四者可对账。
5. 相同 idempotency key 重放不产生第二次写；超时进入 UNKNOWN 后先只读核实。
6. 未确认、越权、过期、数据不新鲜和能力未验证请求全部 fail-closed。
7. MulticaRunExecutor 与 RuntimeExecutor 对同一能力返回同一业务 envelope，前端与工作流无需分支适配。

## 9. 明确不做

- 不把单人机器人 `.env` 复制为全员共享服务凭证；
- 不允许群消息直接修改生产 `CLAUDE.md` 或官方知识；
- 不使用 `echo y` 绕过产品确认门；
- 不把 `tt.sh`、`deduct.py` 或 MITM 身份机制未经验证地宣称为全渠道通用；
- 不因为 RuntimeExecutor 可用就删除 Multica 兜底；
- 不把“沙箱内直接写”表述为“产品已获得正式独立服务权限”。
