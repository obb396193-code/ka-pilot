# Codex 后端交付总账

> 建立日期：2026-08-19  
> 维护角色：be（Codex）  
> 当前连续交付分支：`be/b1a` → `be/b1b` → `be/b1c` → `be/b2` → `be/b3` → `be/b4` → `be/b5`  
> 最新已完成提交：`be/b5` / `53ea264b4a648829209975dc338cb5f677b492d0`  
> 用途：会话恢复、Claude/arch 审查、合并前对账。状态文档和测试结果是快照，合并或上线前仍需重新执行验证。

## 1. 恢复现场先读什么

1. `AGENTS.md`：工作方法、目录边界和红线。
2. 本总账：确认 Codex 已经做过什么，避免重复开发。
3. `docs/plans/B{批次}-状态.md`：看逐批详细任务和验证证据。
4. `docs/relay/inbox-arch.md` 的“P-009”：看 Claude/arch 总审查入口。
5. `packages/contract/`：仍是表、指标和公开 API 的唯一契约源。

不要从已经消失的 `/private/tmp/ka-be-*` 路径判断代码是否丢失。临时 worktree 可以被系统清理，Git 分支与提交才是交付物。

## 2. 分支继承关系

下表各批次是线性继承，不是七套互相独立的实现。`be/b5` 已包含 B1a 至 B5 的全部后端提交。

| 批次 | 最终分支 SHA | 功能审查 SHA | 已完成范围 | 最终记录中的累计测试 | 详细状态/证据 |
|---|---|---|---|---:|---|
| B1a 契约与存储 | `f98952f` | `5b4b937` | PostgreSQL 迁移、月分区、指标纯函数、奇航四资源 Client、DB lease Worker、ETL、raw→canonical、钉钉网关基础 | 69 | `B1a-状态.md` |
| B1b 回灌与对平 | `50e3014` | 同最终 SHA | 90 天回灌、断点续传、优先级与心跳、canonical 聚合、三类数据质量检查、10 户×90 天假数据冒烟 | 88 | `B1b-状态.md`、`docs/evidence/B1b-90天回灌日志.txt` |
| B1c 语义查询 | `a699279` | `997e4d8` | table/summary/trend/dimension/health 五类查询内核、租户隔离、聚合口径与多任务歧义保护 | 101 | `B1c-状态.md`、`docs/evidence/B1c-代码质量报告.md` |
| B2 队列闭环 | `46b7eec` | `9563625` | 首发异常规则、逐条件解释、工作项状态机、并发去重/升级、通知分级、扫描 Worker | 144 | `B2-状态.md`、`docs/evidence/B2-代码质量报告.md` |
| B3 安全执行 | `0af66d0` | `36c72f2` | 变更集、TTL/from-value 冲突、dry-run/确认内核、逐项结果、UNKNOWN 只读对账、反向草稿、T+1 端口 | 165 | `B3-状态.md`、`docs/evidence/B3-代码质量报告.md` |
| B4 任务经营 | `9f7ecea` | `b3b2c49` | 任务 pacing、任务账户有效期、考核价版本、任务日聚合、日报稳定事实集 | 183 | `B4-状态.md`、`docs/evidence/B4-代码质量报告.md` |
| B5 Agent 后端 | `53ea264` | `545637c` | 会话/上下文/记忆/Run、诊断双产物、Claude Agent SDK、Provider 路由、能力探针、短时凭证信封、本地协议网关、流式 Orchestrator | 271 默认 + 1 opt-in | `B5-状态.md`、`docs/evidence/B5-代码质量报告.md`、`docs/evidence/B5-SDK-fake-gateway烟测.md` |

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

## 5. 尚未完成，不能对外宣称完成

- B1a-B5 尚未由 Claude/arch 逐批审计，也尚未合入 `main`。
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

B6 的具体可继续/暂停范围记录在 `docs/plans/B6-状态.md`。
