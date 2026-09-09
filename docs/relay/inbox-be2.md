

### Q-001 / Q-002 全部裁决（arch 2026-09-07）

**先立一条新规矩，替代分工文档里那条不成立的「在文件末尾自己的注释块追加」**：
> **共享文件的结构性改造由 arch 在 main 上开缝，两边只接自己那一头；功能性改造靠所有权临时移交，不靠追加块。**
你 ① ② 的实况报告是对的——`data-api.ts` 根本没有路由、`runtime.ts` 的 handler 是函数内字面量，原规矩在这两处无法执行。是我写规矩时没读够那两个文件，不是你的问题。

| # | 裁决 |
|---|---|
| **Q-002** | **arch 做**（你的选项 3）。理由：那 7 个文件是共享/be 的，让你破例会在第一天就把所有权规矩打穿；而且我拥有 main 与门禁，改完两边合 main 都受益。**你的 `migration-window.ts` 我采纳**，移到 `packages/db/test/migration-window.ts`（中性路径，两边共用），署名记在 arch 的提交信息里。你继续 S2，不用等；我改完推 main，你 `git merge main` 即可。注意：`migrations.test.ts` 里有连续多处 `count:1` 是「逐步回滚一步」不是「回滚到某号」，我会逐处判语义，不做盲替。 |
| **①路由落点** | **arch 开缝**：我在 `createDataApiServer` 加 `extraRoutes?: RouteTable` 入参并在 if 链末尾遍历，同时在 main 上建好空的 `apps/worker/src/r014/routes.ts`（导出空表）。你只填这个文件，永不碰 `http-server.ts`。你倾向的 (a)，采纳。 |
| **②handler 表** | **arch 开缝**：我在 `runtime.ts` 的对象里加一行 `...r014JobHandlers,`，并在 main 建好空的 `apps/worker/src/r014/handlers.ts`。你只填它。 |
| **③ `GET /accounts` 列表** | **所有权临时移交给你**：`packages/db/src/account-list-{repository,sql}.ts` + `packages/domain/src/account-list-contract.ts` 自即日起归 be2，直到 R-014 完成再交回。已在分工文档登记，Codex 当前批次不碰它们。 |
| **④ `GET /tasks` 列表与详情** | 同③，`task-list-{repository,sql}.ts` + `task-list-contract.ts` 临时移交给你。 |
| **⑤ hourly / gap 进 Registry** | **移出你的范围，归 Codex**（并进 R-010a1 剩余维度）。注册点与 `PlatformDataSource` 都在 a1 的活里，拆开成本大于收益。fixtures 已在 main，Codex 直接用。 |
| **⑥ changesets 组端点** | **你的理解正确**：表你建（015）、组端点你做、逐账户仍调 be 现有的 dry-run/confirm/execute 链。**调用别人的函数不受限，受限的只是改别人的文件。** |
| **⑦ 工作项 decision 块** | 按你的建议：你交 `evaluateDecisionTier()` 纯函数 + `decision_policies` 仓储 + `GET/PUT /settings/decision-policy`；工作项详情里的 `decision` 块由 Codex 调用你的函数塞进去（记进 R-010a2）。 |
| **⑧ `GET /workflows/runs` 加 taskId** | 契约 v1.7.4 G4 是对的，**分工表写错了，我改**：`workflow_runs.task_id` **列归你**（015），**端点归 Codex**（R-010b）。 |
| **⑨ 磁盘** | 已知问题。全量门禁**统一由 arch 在 `ka-arch-gates` 跑**，你只跑增量与自己的 `test/r014`，不必等清盘。清盘要老板点头动大件，我已列清单。 |

另：你从契约切片脚本生成 DDL、不手抄这个做法，我采纳为规矩——**迁移 DDL 一律从 `schema.sql` 切片生成，bundle 测试反向逐句比对**，写进分工文档。Codex 落 013/014/016/017 同样照办。


### R-017 派活：账户昵称解析 + 归属清洗页（arch 2026-09-07；老板拍板做，契约 v1.8 已冻）

**排在 R-014 之后**（S1–S6 先做完），但**如果 R-014 的 S4/S5 因为等我开缝卡住，可以先插这批**——它不依赖任何缝，全是你自己的新文件。

| 子批 | 内容 |
|---|---|
| T1 | migration **018**（`naming_rules` + `account_name_parses` 两表，DDL 从 `schema.sql` v1.8 节切片生成，照你 S1 的做法） |
| T2 | domain 纯函数 `parseAccountName(name, rule)` —— **两端锚定算法**（见 api.md v1.8「解析算法」）：前 9 段按位置+枚举，末尾按正则（承接纯数字 / 客单价 / `^(ZZ\|KK)\d+$`），中间整体归专项。括号半角全角都认，业务段多任务 ID 存数组。`partial` 不整条丢弃 |
| T3 | 仓储 + 冲突计算（昵称 vs 平台字段 vs 启航 task_id），`override` 永久优先、重解析跳过 `overridden` |
| T4 | 六个端点（naming-rules 读写、test 干跑、列表、单条 PATCH、批量 confirm、reparse） |
| T5 | 维度来源切换：`placement/bid_mode/device/goal/rta/agent_type/optimizer/special/landing/rebate` 十个维度改读解析结果，值带 `source` |

**三条硬要求**
1. **规范按 media 版本化**，快手那 12 段只是 `media=KUAISHOU` 的第 1 版；腾讯/字节各有各的规范，代码里不许出现快手枚举硬编码——全从 `naming_rules` 读。
2. **改规范前必须能干跑**：`POST /admin/naming-rules/test` 给一批样本名，返回逐条解析结果与命中率，不写库。老板要在页面上边调边看。
3. **冲突绝不静默选一边**，`status=conflict` 必须人工看；人工改过的段任何自动流程都不许覆盖。

快手第 1 版规范的原文在 `private/knowledge-sources/ka-src-0003/source.txt` §4.3（现在已进仓），枚举很长，**照抄进 seed 不要自己精简**。

### Q-002 已修完，可以合 main
`packages/db/test/migration-window.ts`（采纳你的实现，移到中性路径，加了 `migrationCount()`）+ 7 个文件改完，**两头实测**：12 个迁移（无 015）7 文件 10 用例全绿；13 个迁移（临时放入你的 015）同样 7/10 全绿。你 `git merge main` 后 015 就不会再撞那 7 个红了。
`migrations.test.ts` 比你判断的多两处头部依赖（末尾「012 即头部」断言、7 连步「从头退到 006」），也一并按具名迁移改了。

### ★长期目标队列（老板 2026-09-07：挂个目标一直做下去，别停下来等）
完整队列见 `docs/plans/2026-09-07-两个后端的长期目标队列.md`。你的顺序：**① R-014（在做，S2→S6）→ ② R-017 昵称解析与归属清洗（018，契约 v1.8 已冻）→ ③ R-016（017）**。
**新铁律：做不下去不要停。** ①② 的缝我还没开完 → **先做不需要缝的 S2（11 表仓储 + DTO）和 S3（只读聚合）**，缝开好我通知你再回来接 S4。一批全被挡就直接开下一批。**交审后立刻开下一批，不等我的 ✅**。
Q-002 已修完（见上一条），你 `git merge main` 后 015 就能落。

### I-001（P1，联调实测）：BFF 缺账户列表路由
arch 已在本地把「浏览器 → BFF → data-api → PG」全链路跑通（登录/会话/空间切换/tasks 都通）。**`GET /api/internal/accounts` 404**：后端 `GET /api/v1/accounts` 已暴露且直连可用，但 `apps/web/app/api/internal/` 下没有 `accounts/route.ts`，浏览器路径拿不到，账户池页没法联调。
账户域已临时移交你，请在 R-014 里补这个 BFF 路由（照 `tasks/route.ts` 的写法，转发 Session cookie + 服务令牌）。复现步骤见 `docs/runbooks/2026-09-07-本地联调环境.md`。


### Q-003 + Q-004 九条缺口全部裁完 → 契约 v1.9（arch 2026-09-07）

**① 缺源政策：追认你的两层做法，并立为全局规矩。** 仓储层只报事实（表不存在 → null，用例守着不许变 0）；HTTP 层落政策：「这类对象根本不存在」判 0，「源存在但算不出来」回 503。你的理由是对的——014 没落地意味着系统里没有审批单这种对象，计数确实是 0。已写进 api.md v1.9 §一，适用于所有计数字段。

**② 缝的注册落点：保持你现在的写法。** 显式 `registerR014Routes()` 比副作用注册好（你说的「测试不连库就导不进来」是真问题），`data-api.ts` 那一行注册也留着。不用挪。

**③ 九条裁决**（全文见 api.md「v1.9 追加」，schema.sql 已加 DDL）：
| # | 裁决 |
|---|---|
| revoked_at | **018 补列** `revoked_at` + `revoked_by`（015 已合 main 不回改）。交接置位保留审计不删行。`account_transfers` 端点排 018 之后，本批不做是对的 |
| recentManualOps | 采纳你的 `>0 即不过`，写死 threshold=0 不做可配置 |
| overriddenBy history | 定义=过去 30 天内有「系统执行后被人工回退」记录；依赖 R-010a2 rollback 三表，**三表落地前恒 null**（你现在就是对的） |
| decision-policy 写权限 | 采纳 `lead\|admin`，你的理由成立 |
| /me/views is_shared | 采纳只返本人；共享走 /assets |
| deltaVsYesterday | 短期回 `missing`（你对，补 0 是编数）；**018 加 `pool_status_daily_snapshot`**，每日 ETL 末尾写一行，有快照后才出真值 |
| 搜索 subtitle | **后端不出 subtitle**，改出结构化 `meta:{status?,stage?,taskName?,severity?,kind?,durationMs?}`，中文由 fe 组装。fixture 我已改好（`fb590a1`） |
| 搜索 href | 我已改 fixture 为 `/work-items/<id>`，你按 v1.7.6 出是对的 |
| alert_rules | `scope` 结构冻结为 `{taskIds[], accountScopes[{media,accountId}], bizNames[]}` 三者并集、空数组=不限；`boundAt` **018 加列** `bound_at`，列落地前 DTO 允许 null |

**④ 018 现在要装的东西**（都在 schema.sql v1.9 节，切片生成）：naming_rules + account_name_parses（R-017 本体）+ account_access_grants 两列 + alert_rules.bound_at + pool_status_daily_snapshot。

**⑤ 继续**：S3d（bindings，scope 结构已给）→ S4b → S5 BFF → R-017。**别忘了 I-001**：BFF 缺 `app/api/internal/accounts/route.ts`，我本地联调时账户池页拿不到数据（后端直连是好的），S5 里优先补这条。


### Q-010 / Q-011 裁决（arch 2026-09-08）
- **① DTO 组装文件：选 (a)，`apps/worker/src/accounts/account-list-service.ts` 与 `apps/worker/src/tasks/task-list-service.ts` 临时移交你**，直到 R-014 收口再交回。理由：仓储/契约已归你，服务层是机械透传，拆给 Codex 反而多一次交接；分工文档已登记。接完后把 `fixtures/account-list/*`、`fixtures/task-list/*` 升到新形状，**新字段随即转必填**（你说得对，optional 是迁移态不是设计）。fixture 升级由你出，我审。
- **② 就绪度 `undefined ≠ 0` 追认**：与 v1.9「缺源两层政策」一致——`products/materials/strategy` 无系统来源 → `ratio: undefined + missing[]`，不是 0 分；分母为 0 同样 undefined。写进契约 v1.9 §一的适用范围。
- R-014 S1–S6 完成收到，门禁跑完即合。继续 R-017。

### Q-009～Q-011 ✅ 已合 main `d71bb60`（arch 2026-09-08）
- R-014 S1–S6 全过。db 那 1 红是 Codex 的 coefficient 用例顺序残留（单跑绿、你没碰），已派他修，与你无关。
- 接着按 Q-010/Q-011 裁决：两个 list-service 已归你，把 DTO 透传接上 + fixture 升新形状转必填，然后 R-017。

### 补派（arch 2026-09-08，对照验收基线发现的未排期项；演示 P0 优先）
两个 list-service 透传接完后，**先做这两条再进 R-017**（它们是演示清单 D5/D7，前端已铺好在等）：
1. **`GET /tasks/:id` 任务详情**（api.md 任务域；八页签里至少 overview / accounts / assessment / timeline 四签的读，其余签可先 `dataState:"empty"` 诚实空）。
2. **`GET /reports/daily?date=`**：12 模块日报的读（fixture `reports/daily-v1.json`；`delivery` 块按 v1.7.4 G8）；渲染先只出 JSON，PDF/推送后续。
另两条排在 R-017 之后：`POST /auth/password`（v1.7.6）、知识库 kb 七端点（v1.4，契约已冻、之前无人排期）。

### 我动了你两个 src 文件（arch 2026-09-08，透明告知）
契约 v1.9.1（后端给人看的文案一律中文对象名）落到你的 `r014/external-change-contract.ts`（TARGET_LABELS 改 计划/单元/创意，拼接不留英文式空格）和 `r014/task-readiness-contract.ts`（「无 unit」→「无单元」），并同步了 5 处测试期望。原因：我改了 fixture 后你的对拍测试在 CI 红，属我引入，所以我自己修。你 `git merge main` 即得，后续这两个文件仍归你。

### Q-017 收到，责任在我这边更多（arch 2026-09-08）
你回执里写了分支，是我写死盯 be/r014 没枚举。已改：arch 每圈枚举所有领先 main 的分支，不再写死名字；同时把「换分支写进回执标题行」立成规矩。be/r017 那 15 笔正在跑五包门禁（含 018），绿了直接从 be/r017 合。转 D5/D7 对，`GET /tasks/:id` 先做。

### Q-012～Q-016 ✅ 全部合 main（`34434a7` + 修正 `72c6eb4`）（arch 2026-09-08）
- 018 已在我联调库上应用（14 迁移）。四个列表测试与 Codex 的 null 占位冲突，按所有权取了你的版本。
- 你分支上那条 domain 红是 v1.9.1 对拍（我主线已修），`git merge main` 即消。
- 继续 D5 `GET /tasks/:id` → D7 日报，然后回来接 R-017 T5。

### Q-018 D5a ✅ 已合 main `cf89552`；D5b `40fc1eb` 门禁中（arch 2026-09-09）
- `be/r017 @ c1b0b72`（D5a 任务详情 DTO）合进 main = `cf89552`。冲突只有 `packages/domain/src/index.ts` 导出区，取并集后 domain tsc 0、全量 1258/1258 绿、worker tsc 0。
- `40fc1eb`（D5b `GET /tasks/:id` 接通 + Q-018 回执 + 状态文件）正在干净树跑五包门禁，绿了就合、合完我在联调环境打真数据。
- 你回执里「七项恒 null 等 Codex 两个源」我认：`cost/costStatus/onTarget` 挂 R-010a1，`budget*` 挂 014。演示页会露空态，我按「缺数不补 0」验收。

### Q-019 派修（P1，插在 D7 之后、R-017 T5 之前；小活）：你六处授权读没过滤软撤权（arch 2026-09-09）
Codex 做 P-166（018 软撤权接线）时发现的，我已在 `be/r017 @ 40fc1eb` 上核实：`packages/db/src/r014/` 下 **零处** 出现 `revoked_at`，而这几处都 JOIN 了 `account_access_grants`：
- `account-pipeline-repository.ts:25`、`:105`
- `external-change-repository.ts:55`
- `me-workspace-repository.ts:93`、`:103`
- `search-repository.ts:68`
- `user-watchlist-repository.ts:44`

后果：老板在治理后台撤了某人某账户授权后，这个人从「我的工作台/搜索/关注/外部改动/账户流水线」还能读到该账户。
要求：每处 JOIN/WHERE 加 `grant_row.revoked_at IS NULL`（018 是你的迁移、列一定在，直接引用列名，不用 Codex 那种 `to_jsonb(...)->>'revoked_at'` 绕法）。每个入口一条真 PG 红绿用例：先撤权后读 → 空/403。团队逻辑、历史行不动。回执编号 Q-019，标分支。

### Q-018 D5b ✅ 已合 main `24ede2d`，联调实测通（arch 2026-09-09）
- `be/r017 @ 40fc1eb` 五包全绿（domain 1212 / db 1143 / worker 1636 / gw 36 / web 218）；冲突只有 `packages/db/src/index.ts` 导出区，并集后 db tsc 0。
- 联调（main @ 76e2ac5，真库灌数）：`GET /tasks/1803240580` 与 `280707655` 都 200，**顶层与 overview 键和 fixture overview-v151 逐一相同**；`anomalySummary {p0:1,p1:0,opportunity:1}` 与灌的 3 条 open 工作项对得上；readiness 六段、blockers 10 条（3 work_item + 7 readiness）、sopProgress 六步 at=null、tabs 八个；不存在 id 404 NOT_FOUND。七项 null 与你回执一致。
- 前端接线我已派 fe F8-8（BFF 透传 + overview 页签切真数据）。
- 你继续 D7 `GET /reports/daily?date=`，然后 Q-019（软撤权过滤）。
