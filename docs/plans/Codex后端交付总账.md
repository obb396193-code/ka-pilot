# Codex 后端交付总账

> 建立日期：2026-08-19
>
> 维护角色：be（Codex）
>
> 当前连续交付分支：`be/b1a` → `be/b1b` → `be/b1c` → `be/b2` → `be/b3` → `be/b4` → `be/b5` → `be/b6` → `be/b7a` → `be/b8a` → `be/b11` → `be/b12` → `be/b13` → `be/b14` → `codex/b15-material-teardown-semantics`
>
> 最新知识库功能实现提交：`32a82ba`；B1-B8 自审修复基线：`b1bd873`；B9 代码基线：`83cf855`；B10 真实奇航适配终态：`878126f`；B11 第三轮实证适配代码：`1c87e2e`；B15 拆片语义与帧墙代码终态：`020a902`；B16 素材相似与复刻谱系代码终态：`d7a49f8`；B17 商品素材实验矩阵代码终态：`064f1f5`；B18 素材 Brief 回测就绪代码终态：`54f5223`；B19 月度结算单代码终态：`c2fed1f`；B20 公共资产治理代码终态：`d22a5d8`；B21 未触发诊断代码终态：`f985923`
>
> 最新修复质量证据：`docs/evidence/B1-B8自审修复-代码质量报告.md`；审查入口：`docs/relay/inbox-arch.md` P-014
>
> 用途：会话恢复、Claude/arch 审查、合并前对账。状态文档和测试结果是快照，合并或上线前仍需重新执行验证。

## 1. 恢复现场先读什么

1. `AGENTS.md`：工作方法、目录边界和红线。
2. 本总账：确认 Codex 已经做过什么，避免重复开发。
3. `docs/plans/B{批次}-状态.md`：看逐批详细任务和验证证据。
4. `docs/relay/inbox-arch.md` 的“P-009”和最新 P-012：看 Claude/arch 总审查入口与 B8 专项待审项。
5. `packages/contract/`：仍是表、指标和公开 API 的唯一契约源。

不要从已经消失的 `/private/tmp/ka-be-*` 路径判断代码是否丢失。临时 worktree 可以被系统清理，Git 分支与提交才是交付物。

## 2. 分支继承关系

下表各批次是线性继承，不是多套互相独立的实现。`be/b8a` 已包含 B1a 至 B8a 的全部后端提交。

| 批次 | 最终分支 SHA | 功能审查 SHA | 已完成范围 | 最终记录中的累计测试 | 详细状态/证据 |
|---|---|---|---|---:|---|
| B1a 契约与存储 | `f98952f` | `5b4b937` | PostgreSQL 迁移、月分区、指标纯函数、奇航四资源 Client、DB lease Worker、ETL、raw→canonical、钉钉网关基础 | 69 | `B1a-状态.md` |
| B1b 回灌与对平 | `50e3014` | 同最终 SHA | 90 天回灌、断点续传、优先级与心跳、canonical 聚合、三类数据质量检查、10 户×90 天假数据冒烟 | 88 | `B1b-状态.md`、`docs/evidence/B1b-90天回灌日志.txt` |
| B1c 语义查询 | `a699279` | `997e4d8` | table/summary/trend/dimension/health 五类查询内核、租户隔离、聚合口径与多任务歧义保护 | 101 | `B1c-状态.md`、`docs/evidence/B1c-代码质量报告.md` |
| B2 队列闭环 | `46b7eec` | `9563625` | 首发异常规则、逐条件解释、工作项状态机、并发去重/升级、通知分级、扫描 Worker | 144 | `B2-状态.md`、`docs/evidence/B2-代码质量报告.md` |
| B3 安全执行 | `0af66d0` | `36c72f2` | 变更集、TTL/from-value 冲突、dry-run/确认内核、逐项结果、UNKNOWN 只读对账、反向草稿、T+1 端口 | 165 | `B3-状态.md`、`docs/evidence/B3-代码质量报告.md` |
| B4 任务经营 | `9f7ecea` | `b3b2c49` | 任务 pacing、任务账户有效期、考核价版本、任务日聚合、日报稳定事实集 | 183 | `B4-状态.md`、`docs/evidence/B4-代码质量报告.md` |
| B5 Agent 后端 | `53ea264` | `545637c` | 会话/上下文/记忆/Run、诊断双产物、Claude Agent SDK、Provider 路由、能力探针、短时凭证信封、本地协议网关、流式 Orchestrator | 271 默认 + 1 opt-in | `B5-状态.md`、`docs/evidence/B5-代码质量报告.md`、`docs/evidence/B5-SDK-fake-gateway烟测.md` |
| B6 分析与报表 | 见 `be/b6` HEAD | `6dc7ed1` | 严格内部报表计划、可信组件数据集、Gap 对账、策略样本护栏、B1c 事实适配、幂等报表 Worker | 304 默认 + 1 opt-in | `B6-状态.md`、`docs/evidence/B6-代码质量报告.md`、P-010 |
| B7 工作流可靠执行 | 见 `be/b7a` HEAD | `b0024e1`；质量 `90eea92` | Capability Registry、严格 DAG 编译、事件重放、固定版本 Repository、无写入 Simulation、可恢复 Runner、Changeset 确认门和 UNKNOWN | 367 默认 + 1 opt-in | `B7-状态.md`、`docs/evidence/B7-代码质量报告.md`、P-011 |
| B8 知识库领域底座 | 见 `be/b8a` HEAD | `32a82ba`；质量 `8c87530` | BlockNote 安全信封、文本投影/指纹、ID 双链、KA 业务引用、资产语义、权限化 Agent citation 边界 | 406 默认 + 1 opt-in | `B8-状态.md`、`docs/evidence/B8-代码质量报告.md`、P-012 |
| B1-B8 自审修复 | `b1bd873` | 原审查 `1919a8e`；复验 `48c7fd5`/`b1bd873` | 修复日常 ETL 派发、Job fencing、确认 TTL、Changeset+T1、知识正文权限、输出凭证、生命周期、身份、分页、分区、上海业务日等；其余契约项明确保留 | 422 默认 + 1 opt-in | `docs/evidence/B1-B8自审修复-代码质量报告.md`、P-014 |
| B8a 交接与联调准备 | `9fce24a`（代码） | 待 Claude/arch 审查 P-015 | Qihang 响应/行/ID/URL 资源预算，Qihang→Canonical 纯合成基线，前后端合并清单与真实通路准入矩阵 | 434 默认 + 1 opt-in | `docs/evidence/B8a-数据链性能基线.md`、`docs/evidence/B8a-交接准备代码质量报告.md`、P-015 |
| B9 纵向闭环与批量性能 | `83cf855`（代码） | 待 Claude/arch 审查 P-016 | Canonical settings/history/upsert 批量化，假奇航→真实 PG→质量/语义/规则/工作项/报告事实闭环，真实 PG 100/1000/5000 基准，realtime/offline source 对平 | 445 默认 + 1 opt-in | `B9-状态.md`、`docs/evidence/B9-数据链真实PG性能基线.md`、`docs/evidence/B9-代码质量报告.md`、P-016 |
| B10 真实奇航适配 | `878126f` | 待 Claude/arch 审查 P-017 | 日期紧凑格式、离线分区有界回退、历史真实转化来源、双口径事实和 Skill 身份补证 | 变更定向 34；非 PG 回归见状态 | `B10-状态.md`、`docs/evidence/B10-真实奇航只读适配报告.md`、P-017 |
| B11 时效完整性与小时监控 | `1c87e2e`（第三轮代码） | 待 Claude/arch 审查 P-018 | 历史 realtime 诊断、`hh` 0..24 Client 边界、广告 5/80 分片与 2000 截断 fail-closed、查询观测、D-1 动态重查、累计小时安全差分和幂等落库 | Domain 207 / DB 92 / Worker 200 / Gateway 19 + 1 opt-in | `B11-状态.md`、`docs/evidence/B11-代码质量报告.md`、P-018 |
| B12 广告 ID 与素材来源桥 | `fb3bf9f`（代码） | 待 Claude/arch 审查 P-019 | 广告对象完整性/映射证据门、奇航素材池严格分页、默认拒绝的视频 URL 来源探针 | 定向 54；非 PG 回归见状态 | `B12-状态.md`、`docs/evidence/B12-代码质量报告.md`、P-019 |
| B13 素材拆片后端内核 | `85c5fbf`（代码） | 待 Claude/arch 审查 P-020 | 受控下载、字幕/云 ASR 端口、FFmpeg 抽帧、证据 Schema、版本化 Prompt、Claude Agent SDK 结构化分析、可恢复编排 | Domain 235 / DB 92 / Worker 287 / Gateway 19 + 1 opt-in | `B13-状态.md`、`docs/evidence/B13-代码质量报告.md`、P-020 |
| B14 单次整段 ASR 与 URL 租约 | `6cea3d8`（代码） | 待 Claude/arch 审查 P-021 | `segment/whole_video` 精度、一次整段云 ASR adapter、稳定 sourceRef 换短期 URL 后即取即下 | Domain 244 / DB 92 / Worker 297 / Gateway 19 + 1 opt-in | `B14-状态.md`、`docs/evidence/B14-代码质量报告.md`、P-021 |
| B15 拆片语义与逐镜头帧墙 | `020a902`（代码） | 待 Claude/arch 审查 P-022 | 无时间多段语义结构、精确时间证据门、Prompt v3、分页逐镜头帧墙、旧缓存升级和页面承接结果信封 | Domain 245 / DB 92 / Worker 301 / Gateway 19 + 1 opt-in | `B15-状态.md`、`docs/evidence/B15-代码质量报告.md`、P-022 |
| B16 素材相似度与复刻谱系 | `d7a49f8`（代码） | 待 Claude/arch 审查 P-023 | 版本化内容画像、六组件可解释确定性评分、证据不足无总分、独立不可变复刻谱系 | Domain 270 / DB 92 / Worker 301 / Gateway 19 + 1 opt-in | `B16-状态.md`、`docs/evidence/B16-代码质量报告.md`、P-023 |
| B17 商品×素材实验矩阵 | `064f1f5`（代码） | 待 Claude/arch 审查 P-024 | 无默认阈值样本策略、幂等事实汇总、显式 click/exposure 推断分母、Wilson 95% 区间、保守观察分离 | Domain 295 / DB 92 / Worker 301 / Gateway 19 + 1 opt-in | `B17-状态.md`、`docs/evidence/B17-代码质量报告.md`、P-024 |
| B18 素材 Brief 与回测就绪 | `54f5223`（代码） | 待 Claude/arch 审查 P-025 | 单变量结构化 Brief、B16 谱系交付绑定、B17 同策略样本就绪判断、稳定指纹与完整性门 | Domain 310 / DB 92 / Worker 301 / Gateway 19 + 1 opt-in | `B18-状态.md`、`docs/evidence/B18-代码质量报告.md`、P-025 |
| B19 月度结算单内核 | `c2fed1f`（代码） | 待 Claude/arch 审查 P-026 | 版本化字段模板、受限公式、显式总计/容差、offline 事实、修正链、预览与冻结快照 | Domain 352 / DB 92 / Worker 301 / Gateway 19 + 1 opt-in | `B19-状态.md`、`docs/evidence/B19-代码质量报告.md`、P-026 |
| B20 公共资产治理 | `d22a5d8`（代码） | 待 Claude/arch 审查 P-027 | 五类资产不可变版本、五段状态机、验证/使用事实、完整元数据、替代版本和统一摘要 | Domain 381 / DB 92 / Worker 301 / Gateway 19 + 1 opt-in | `B20-状态.md`、`docs/evidence/B20-代码质量报告.md`、P-027 |
| B21 工作流未触发诊断 | `f985923`（代码） | 待 Claude/arch 审查 P-028 | 版本绑定 gate 快照、三态评估、第一/全部阻断、证据/retryAt 与稳定 next action | Domain 397 / DB 92 / Worker 301 / Gateway 19 + 1 opt-in | `B21-状态.md`、`docs/evidence/B21-代码质量报告.md`、P-028 |

表中的测试数是每批最终全仓累计值，不能相加计算“总测试数”。

## 3. Codex 做过的关键技术决定

- PostgreSQL/SQL-first 是数据真相；没有引入第二套 ORM Schema。
- 指标、pacing、Gap 等确定性数字由领域函数和语义查询计算，不交给模型心算。
- 所有业务查询显式带 `workspace_id`；不支持的维度和歧义归属 fail-closed。
- 媒体写操作走变更集、预览、确认、执行、对账；Agent 仅能获得 read/preview 原子能力。
- OS/Multica 是受保护执行端口；没有伪造其请求/回执协议，也没有导出或借用其 Token。
- 产品内 Agent 只有一套 Claude Agent SDK Runtime；多模型由 localhost 协议网关适配，不建立多套 Agent Runtime。
- Agent 子进程关闭内建 Bash/文件/Web/Task/Skill，关闭自动记忆，只开放服务端闭包绑定的 MCP allowlist。
- Provider 凭证使用绑定 workspace/user/run/provider/model 的短时 AES-GCM 信封；真实 AK 不进入提示词、SDK 子进程配置或持久化事件。
- Fake upstream、mock PostgreSQL 和本地协议烟测只证明代码链路，不代表真实奇航、IdeaLab、Anthropic、Multica/OS 已联通。
- 工作流画布、页面按钮和 Agent tool 共用 Capability Registry；execute 不可直接暴露 Agent，只经 B3 Changeset 预览、hash 确认和幂等执行。
- 工作流运行以 exact published version + 事件重放为真相；崩溃恢复不重跑成功节点，执行结果含糊时进 UNKNOWN 等待对账。
- 知识正文以受限 BlockNote blocks 为真相，文本、双链和业务引用都是可重建派生结果；Agent 只接收经 workspace/user 和业务对象双重权限裁剪的 citation。

## 4. Claude/arch 必审清单

### 4.1 先审共同红线

- 租户隔离：Repository、查询、任务、Agent context 是否都不能跨 workspace/user。
- 凭证边界：是否存在明文 AK/PAT、日志回显、跨 Run 重放或重试换身份。
- 写操作：是否始终经过变更集确认门；UNKNOWN 是否禁止盲目重放。
- 数据口径：汇总比率是否从分子/分母重算，raw 重试行是否被重复累计。
- 事实边界：mock/fake 结果是否被错误写成生产通路验证。

### 4.2 再按提交范围逐批审

```text
main..be/b1a
be/b1a..be/b1b
be/b1b..be/b1c
be/b1c..be/b2
be/b2..be/b3
be/b3..be/b4
be/b4..be/b5
be/b5..be/b6
be/b6..be/b7a
be/b7a..be/b8a
```

审查每批时同时读取对应 `B*-状态.md`、design、implementation 和 evidence，不仅看最终汇报。

### 4.3 契约集中裁决

历史分支快照中曾复用 `P-005/P-006/P-007` 编号，因此不得只凭 P 编号定位。以“批次名 + SHA + P-009 总索引”为准。

待裁决主题包括：

- B1c：query_type/DTO、跨任务归属、缺失维度数据源。
- B2：复合规则、工作项去重和状态机、静音与通知调度。
- B3：typed changeset value、同账户锁、hash、部分成功/回滚/UNKNOWN DTO。
- B4：任务主键、pacing 日历、日报 12 模块、考核价重算通知。
- B5：Agent session/run/event、Provider credential/capability、SSE、诊断 DTO、OS 工具和 usage 账本。
- B6：报表 config/资产治理/定时/导出、策略维度和 Agent 报表草稿。
- B7：公开 graph/API、资产治理、输出存储、触发/job lease、权限与真实 Changeset/OS/Multica 接缝。
- B8：文档 revision/ETag、树与双链 Schema/API、搜索索引、业务对象权限、资产治理和自动归档任务。

## 5. 尚未完成，不能对外宣称完成

- B1a-B8a 尚未由 Claude/arch 逐批审计，也尚未合入 `main`。
- `apps/web` 正式 API Route 和前后端 E2E 尚未完成。
- 真实奇航、Multica/OS、Secret 服务、IdeaLab/Anthropic 模型通路尚未联调。
- Agent 生产容器/微虚机沙箱、CPU/RAM/磁盘限制和 egress allowlist 尚未完成。
- Claude Agent SDK 经协议适配驱动非 Anthropic 模型的许可边界，正式使用前仍需内部法务/采购确认。
- daily 环境部署、真实数据对平和老板业务验收尚未完成。

## 6. 当前继续开发边界

Claude 未恢复不等于所有后端都要停。可以在 `be/b5` 之后继续独立分支，但必须满足：

1. 不修改 `packages/contract/`。
2. 不碰 Claude 当前 `fe/f001` 工作树。
3. 不新增公开 API、数据库字段或真实外部协议。
4. 只做可替换的领域纯函数、内部端口、Repository 适配和测试。
5. 新发现的契约缺口继续写 `inbox-arch.md`，等 Claude 集中裁决。

B6/B7a/B8a 已在上述边界内完成，且均未接入公开 API 或生产 runtime。Claude/arch 恢复后先审 P-010/P-011/P-012 并冻结契约；其前不建知识库表、公开 API 或前端接缝。

## 7. 2026-08-20 当前修复与交接真相

### 已独立修复

- 原始 14 个 P0 已修 6 个；17 个 P1 已明确修复 9 个（B9 新增修复 P1-03 实时/离线质量对平、P1-16 Canonical 批量性能）。
- 当前累计 445 个默认 tests 通过，真 Claude Agent SDK smoke 单独通过。
- Coverage：Domain 95.43%、DB 93.61%、Worker 91.69%、DingTalk Gateway 86.62%。
- 四包 typecheck/lint/audit、PG16 migration replay 和变更代码复杂度门禁通过。

### 仍需裁决/接线

- 8 个 P0：账户权威 workspace 归属、回填完整 DAG 终态、缺数公开状态、多任务归属、Workflow 单执行器/effect outbox、钉钉 durable inbox/outbox、Changeset 目标权限矩阵等。
- 8 个 P1：补偿暂估、mute、健康度分母、策略模型、Simulation/Changeset preview、租户唯一约束、Agent session 并发、Qihang/Raw 资源上限的剩余分片。P1-03 与 P1-16 已由 B9 修复。
- B2-B8 大量能力仍是内部内核，未统一接生产 Runtime/API/前端。

### 分支状态

- `be/b8a` 尚未被 `fe/f001` 包含，也尚未完成 Claude/arch 审查。
- 共同基线为 `9335150`；当前 committed 同路径变更 5 个，明确文本冲突集中在工作台账、两信箱和 `schema.sql`。
- 合并操作必须等 Claude 收口脏工作树后，在独立 integration 分支执行；详见 `docs/plans/2026-08-20-be-b8a与fe-f001合并清单.md`。

## 8. 交接准备新增真相

- `6c1d65b`：Qihang 默认响应 10 MiB、10000 行、1000 IDs、64 KiB URL；超限不重试。大于 1000 账户尚未定义正式分片语义。
- `9fce24a` 的旧合成基线曾确认 Canonical 为 `3N+4`；B9 `83d7e4f` 已将其改为 `3×ceil(N/250)+4`，并由真实 PG 100/1000/5000 基准验证。两者都不能当生产 SLA。
- 真实通路统一按 `docs/plans/2026-08-20-真实通路联调准备清单.md` 放行。Multica/OS 正式协议、Secret 服务、真实 Provider、钉钉 durable 状态机和 FaaS/PG 本项目部署仍是硬阻断。
- 当前代码审查点是 `9fce24a`，文档审查入口为 P-015；二者均尚未合入 `fe/f001` 或 `main`。

## 9. B9 纵向闭环与批量性能真相

- 真实 PostgreSQL 纵向测试已连接 Full ETL、Raw、Canonical、质量、语义查询、规则、工作项和报告事实；只有奇航输入、未冻结规则候选和外发告警是测试适配器。
- Canonical 默认 250 行批次，设置/历史/Upsert 以复合键严格映射；第二批失败不派生质量，重试由 Upsert 收敛。
- Full/Incr ETL Run 已带 workspace；质量对平按 Canonical cost source 选择 offline/realtime latest Raw，不再每天误报 realtime gap。
- 真实 PG 5000 行三次中位数 394.974ms、64 次端口调用、5000 最终行；仅为本机热缓存单租户证据。
- Raw 仍是 append-only，重试可能留下物理重复抓取；latest 读取避免进入 Canonical 双计，但是否增加 request/run idempotency 需 arch 裁决。
- B9 未新增公开 contract/migration/production job type/API/前端，也未接真实奇航/Multica/OS。审查入口 P-016。

## 10. B10 真实奇航只读适配真相

- OS 在合法身份下真实确认奇航四资源、显式 userId、紧凑日期、结构化返回和空数组语义；当天 realtime 为分钟级，离线仅在本次观察到 D-1 空、D-2 命中，不能把 D-2 写成系统整体延迟或固定 SLA；原始业务规模与数据未进入仓库。
- 代码修复内部 ISO→`YYYYMMDD`、最多三日离线空分区回退、历史离线 `account_real_conversion` 优先级；不改公开契约、Migration、API 或前端。
- `hh`、跨日离线、部分分区完整性、现金字段缺失语义和服务身份继续未验证。
- 真实请求仍由 OS 执行，不等于产品 Worker/FaaS 已联通；Gate B 要等本项目 SHA 的 Raw→Canonical→质量同链 trace。
- 本轮 PostgreSQL 回归因本机 Docker 引擎未就绪未重跑；相关失败为连接拒绝，非业务断言失败。其余定向/非 PG 回归和四包静态门禁通过，详见 B10 evidence 和 P-017。

## 11. B11 第三轮实证与代码收口真相

- OS 真实确认历史 `account_realtime`/`ad_realtime` 可查；这是诊断回溯能力，不改变结算/对账必须使用 offline 的产品口径。
- `hh=0/23/24` 有效，25 被服务端静默钳制；原子 Client 因此自校验 0..24，ETL payload、Domain 与小时表仍只接受 0..23。
- 无过滤 `ad_realtime` 返回 2000 行、5 账户分片并集返回 2017 行，且分页参数被忽略，静默截断已实证。代码禁止无过滤查询，默认 5 账户/80 广告 ID、最多 200 批顺序执行；全部分片成功后才合并和进入小时/Canonical。
- 合并按 `account_id+ad_id+ds` 去重，相同重复收敛、冲突重复失败，并保留最大 `last_sync_time`；任一分片失败或命中 2000 都 fail-closed。
- 释放经老板确认的闲置第三方可再生缓存后，Docker 29.5.2 与 PostgreSQL 16 恢复；B11 Repository 真 PG 5/5、DB 全量 92/92、Worker PG 4/4 和 migration replay 均通过。
- 最终默认回归 Domain 207 + DB 92 + Worker 200 + DingTalk 19 = 518；另有真实 Claude Agent SDK opt-in 1。Worker 全仓行覆盖 92.19%，新增分片与增量 Handler 行覆盖 100%。
- 仍未完成：产品 Worker/FaaS 合法身份真实 trace、单账户仍命中 2000 时的权威 adIds 拆分来源、offline complete marker。不得把 OS 沙箱实测写成产品部署完成。

## 12. B12 广告 ID 与素材来源桥真相

- `be/b12` 从 B11 干净终态切出，未修改公开 contract、migration、DB Repository 或前端。
- 广告对象枚举已具备严格分页/total/空页/资源预算；但 `unit_id == ad_realtime.ad_id` 尚未真实确认，只有附 OS 集合对照或正式平台契约证据指纹的 `complete + confirmed_equal` 才能输出权威 `adIds`。
- 素材池已按 qihang-cli 源码确认的 dataservice-api 只读协议实现严格分页，支持明确 poolIds + itemIds/NULL；不会把 total 漂移、提前空页或冲突重复伪装成完整结果。
- 视频来源只做到准入探针：部署默认无 allowlist，逐跳校验 host，HEAD 或单字节 Range 确认类型和大小；未下载正文、未接 ContentRadar 拆片。
- 代码终态 `fb3bf9f`；定向 54、Worker 非 PG 238、Domain 207、DingTalk 19、DB 无 IO 12 通过；四包静态和 audit 通过。Docker daemon 本轮持续 `EOF`，因此没有重跑真实 PG，必须作为合并前门禁保留。
- OS 第四轮需确认 ID 映射和素材 URL/FaaS 可达性；在此之前 B11 单账户 2000 行继续 fail-closed，生产素材 host allowlist 保持空。

## 13. B13 素材拆片后端内核真相

- B13 已实现安全下载、真实 FFmpeg/FFprobe、平台字幕优先与云 ASR 端口、完整证据时间轴、严格结构化拆解以及内容/版本指纹驱动的可恢复编排；没有接公开 API、DB migration、正式 Job 或生产 Runtime。
- ContentRadar 只读复用了抽帧方法；老板本地拆片 Prompt 按源 SHA 与模板 SHA 固定快照到 KA，运行时不访问 Obsidian，也没有修改 ContentRadar。
- Agent 复用唯一 Claude Agent SDK Runtime 和 localhost 多模型网关，默认无 built-in/MCP tool；真实 SDK 子进程经本地伪上游通过，只证明代码链，不证明真实 Provider。
- 不做本地 ASR。`CloudAsrPort` 尚无供应商适配；真实视频帧也因未冻结受信任多模态 Provider/数据边界而保持阻断，Agent 不得假装看过图。
- Worker 默认 287、Domain 235、DB 92、DingTalk 19 和 SDK opt-in 1 通过；B13 materials 覆盖率为 95.96%/86.75%/98.75%。真实 PG/migration 与真实 FFmpeg 生成视频门禁均通过。
- 仍未完成：真实产品身份素材 E2E、云 ASR、受信任视觉 Provider、artifact/checkpoint 持久化、任务/API/DB/前端、素材相似检索与复刻、OS 商品/承接页/字幕后续实证。

## 14. B14 单次整段 ASR 与临时 URL 租约真相

- 老板已裁决一期先做诊断：每条视频只调用一次 IdeaLab 风格 ASR，不切块、不等待句级时间戳；因此当前只能做全文级文案与结构诊断。
- `segment|whole_video` 精度已进入字幕、证据和 fingerprint；无时间戳结果只允许一个全片 `other` 分析段，拒绝虚构具体秒点或镜头归因。
- `WholeTextCloudAsrAdapter` 已实现一次 transport 调用、严格 `{text}` 输出、Provider/profile 绑定和安全错误；真实 IdeaLab endpoint、AK、multipart 与配额契约尚未实现。
- Handler 现在以稳定 `sourceRef` 领取临时签名 URL 后立即下载；每次重试重新领取，URL 不进入 checkpoint。OS/Multica source bridge 的真实协议仍待冻结。
- Prompt 已升级 `teardown-v2` 并固定 SHA；真实视频帧外发仍保持 B13 阻断。
- 代码终态 `6cea3d8`。默认回归 Domain 244 + DB 92 + Worker 297 + DingTalk 19 = 652；SDK opt-in 1 另行通过。Worker 全仓 92.57%/80.92%/95.71%，materials 96.30%/87.79%/98.90%。
- 未修改公开 Contract、migration、生产 Runtime 或前端；未合并、未部署、未完成真实 IdeaLab/OS/产品身份 E2E。审查入口 P-021。

## 15. B15 拆片语义与逐镜头帧墙真相

- 老板纠正术语：拆片是按指定提示词对文稿和视觉结构做逆向分析；抽帧是逐镜头代表帧集中展示；均不等于导出多个 MP4。
- B14 的“whole_video 只能一个全片 other 段”已被 Schema v2 替代：整段文稿可以输出多个有序 `semanticSections`，但 `segments` 必须为空，不能伪造秒点。
- 有时间字幕继续输出完整时间段，且每段引用的字幕/镜头证据必须与其时间真实相交；所有语义段至少包含文稿证据。
- Prompt `teardown-v3` 按老板原七模块目标整理，并以源/模板 SHA 和 Schema v2 固定；不匹配时在 Agent 调用前阻断。
- FFmpeg 现在除 Hook/全片帧墙外，还生成每页 36 格的逐镜头帧墙；placeholder 保持槽位，两页并发，页失败诚实降级。
- Handler 返回 film/transcript/analysis 内部信封；B14 旧 film/analysis checkpoint 根据新清单和 Schema 选择性重建，不盲目全链重跑。
- 最终默认回归 657 passed，另有 Claude Agent SDK opt-in 1；真实 PG、migration、localhost gateway 和真实 FFmpeg 均通过。未接公开 API/DB/前端和真实外部通路，审查入口 P-022。

## 16. B16 素材相似度与复刻谱系真相

- B16 只做纯 Domain，不代表商品素材页面 6.3/6.6 已完成；相似列表查询、DB/API/前端仍未接。
- 画像直接来自 B15 已校验拆片结果，按语义结构、钩子、卖点、人群、节奏、CTA 建模；不混入消耗、转化率或 GMV。
- 六组件按可用信息参与并重新归一；少于 3 个组件或原始权重小于 0.50 时返回 `insufficient_evidence`，不是 0 分。
- 复刻谱系是显式、版本化、不可变的业务事实，和算法相似度完全分离；不会按阈值自动认定“复刻自”。
- 当前采用确定性 n-gram/结构评分作为低成本可解释基线；Embedding/向量库只作为未来候选召回或重排，不在未冻结 Provider 边界前引入。
- 代码终态 `d7a49f8`。默认回归 Domain 270 + DB 92 + Worker 301 + DingTalk 19 = 682；SDK opt-in 1。四包静态/audit、真实 PG/migration、gateway/FFmpeg 与冻结目录门禁通过，审查入口 P-023。

## 17. B17 商品×素材实验矩阵真相

- B17 只做纯 Domain，验收 6.7 仍缺权威事实映射、业务策略、持久化/API/页面，不能标产品完成。
- 每套样本策略必须显式带版本、六类门槛、CPA 最小改善率和 click/exposure 推断分母；没有默认业务阈值，也不写死点击归因。
- 同 sourceFactId 重试幂等，冲突重复失败；所有比率从聚合分子/分母重算，零分母保留 undefined/infinite 状态。
- 最低 CPA 只给方向；只有达到 CPA 改善门、且其 95% 推断率区间与所有其他合格候选保守分离，才返回 `separated_observation`。
- 该状态不是随机 A/B、统计因果或自动操作建议；代码无 Agent、媒体写入或通知分支。
- 代码终态 `064f1f5`。默认回归 Domain 295 + DB 92 + Worker 301 + DingTalk 19 = 707；SDK opt-in 1。新增模块 100%/97.08%/100%，四包静态/audit、真实 PG/migration、复杂度、安全与冻结目录门禁通过，审查入口 P-024。

## 18. B18 素材 Brief 与回测就绪真相

- B18 只做纯 Domain，不代表验收 6.5 的设计师派发、素材制作、上线关联和页面已完成。
- 每个 Brief 固定商品、源素材、B15 teardown/profile 和 B17 policy；每个变体只改变一个维度并声明不变量。
- 交付必须通过 B16 显式复刻谱系验证；完全重试幂等，来源、变体或派生素材冲突失败。
- 缺交付先返回 `awaiting_delivery`；全部交付后才按同一 policy/商品检查派生素材样本，区分 `awaiting_sample / ready`。
- `ready` 只表示具备回测样本，不读取胜负、不构成效果或投放建议，代码无 Agent/通知/媒体写入。
- 代码终态 `54f5223`。默认回归 Domain 310 + DB 92 + Worker 301 + DingTalk 19 = 722；SDK opt-in 1。新增模块 97.19%/85.71%/100%，四包静态/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全与冻结目录门禁通过，审查入口 P-025。

## 19. B19 月度结算单真相

- B19 只做纯 Domain，不代表验收 7.3 的真实模板、自动取数、导出、推送和页面已完成。
- 模板版本决定字段、顺序、类型、fact 映射、受限四则公式、是否求和、对账容差和严重度；没有默认字段、系数或阈值。
- 预览只接受 offline_settlement，数据截止不得早于期末；事实重试幂等，缺数/类型/公式/检查问题显式可见。
- 人工修正是 from-value 一致的不可变事件链；冻结只接受无阻断预览，并内嵌模板和值快照，旧单不随新模板变化。
- Agent 不参与数字计算；模块无 IO、动态代码、通知或写操作。
- 代码终态 `c2fed1f`。默认回归 Domain 352 + DB 92 + Worker 301 + DingTalk 19 = 764；SDK opt-in 1。新增模块 100%/92.76%/100%，四包静态/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全与冻结目录门禁通过，审查入口 P-026。

## 20. B20 公共资产治理真相

- B20 只做纯 Domain，不代表验收 14.10 的资产页面、审查后台和真实业务资产接入完成。
- report/workflow/strategy/object_group/knowledge 使用统一不可变版本，记录 owner/维护人、适用范围、依赖、来源、版本和变更说明。
- 生命周期严格 `draft→shared→verified→official→deprecated`；修改公共版本必须创建新 draft，不原地覆盖。
- verified 必须有绑定当前版本/定义的最近 passed 证据；成功率仅由显式次数计算，定性验证保留 null。
- 使用人数/频次只聚合版本绑定 usage facts；废弃必须写原因，可指向非自身替代版本。
- 代码终态 `d22a5d8`。默认回归 Domain 381 + DB 92 + Worker 301 + DingTalk 19 = 793；SDK opt-in 1。新增模块 99.69%/85.00%/100%，四包静态/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全与冻结目录门禁通过，审查入口 P-027。

## 21. B21 工作流未触发诊断真相

- B21 只做 Scheduler 评估结果的纯 Domain 信封，不代表运行中心页面或触发器已接入。
- evaluation 固定 workflow/version/trigger；检查顺序连续且原因唯一，保留 passed/blocked/not_evaluated。
- 输出 eligible/blocked/incomplete、全部阻断、第一阻断、证据、retryAt 和稳定 nextActionCode。
- eligible 不是 run/execution 成功；门槛由真实数据、权限、冲突、调度器产生，本模块不发明阈值。
- 代码终态 `f985923`。默认回归 Domain 397 + DB 92 + Worker 301 + DingTalk 19 = 809；SDK opt-in 1。新增模块 98.54%/91.02%/100%，四包静态/audit、真实 PG/migration、gateway/FFmpeg、复杂度、安全与冻结目录门禁通过，审查入口 P-028。

## 22. B22 IdeaLab whole-video ASR Provider 真相

- OS 真实诊断确认固定 endpoint、Bearer、multipart `file/model=whisper/response_format=json`；MP4 返回 `CE-009`，PCM s16le/16kHz/mono WAV 成功，响应 `{text,usage}` 且无时间戳。
- Worker 已实现默认关闭的安全配置、受控 WAV 提取、单次 Transport、有界严格响应解析、稳定错误分类、无正文 usage 观测和 whole-video Adapter 工厂。
- endpoint 在配置和 Transport 双层锁定已验证 host/path；AK 不进入序列化配置、错误、观测、文档或测试输出。
- `whole_video` 语义不变：文稿拆片可输出无时间语义结构，关键帧墙独立存在，不伪造逐句秒点或镜头对应。
- 生产函数 complexity≤10、单函数≤100、文件≤300；配置与核心模块覆盖率 94.43%/82.12%/100%。
- 代码终态 `b60e09e`。默认回归 Domain 397 + DB 92 + Worker 344 + DingTalk 19 = 852；真实 PG/migration、gateway/FFmpeg 和四包静态/audit 通过。
- 未完成：真实产品身份 ASR 烟测、每用户 Secret、Job/API/DB/前端、重试/配额/审计、部署和业务 E2E。审查入口 P-029。
