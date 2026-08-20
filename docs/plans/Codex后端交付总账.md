# Codex 后端交付总账

> 建立日期：2026-08-19
>
> 维护角色：be（Codex）
>
> 当前连续交付分支：`be/b1a` → `be/b1b` → `be/b1c` → `be/b2` → `be/b3` → `be/b4` → `be/b5` → `be/b6` → `be/b7a` → `be/b8a`
>
> 最新知识库功能实现提交：`32a82ba`；B1-B8 自审修复基线：`b1bd873`；B9 代码基线：`83cf855`；B10 真实奇航适配：待本轮提交
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

- OS 在合法身份下真实确认奇航四资源、显式 userId、紧凑日期、结构化返回、空数组语义和 D-2 离线延迟；原始业务规模与数据未进入仓库。
- 代码修复内部 ISO→`YYYYMMDD`、最多三日离线空分区回退、历史离线 `account_real_conversion` 优先级；不改公开契约、Migration、API 或前端。
- `hh`、跨日离线、部分分区完整性、现金字段缺失语义和服务身份继续未验证。
- 真实请求仍由 OS 执行，不等于产品 Worker/FaaS 已联通；Gate B 要等本项目 SHA 的 Raw→Canonical→质量同链 trace。
- 本轮 PostgreSQL 回归因本机 Docker 引擎未就绪未重跑；相关失败为连接拒绝，非业务断言失败。其余定向/非 PG 回归和四包静态门禁通过，详见 B10 evidence 和 P-017。
