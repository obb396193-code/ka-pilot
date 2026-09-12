

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

### Q-020 派修（P1 安全，**插在 T5/A7 之前立刻做**）：D5 任务详情个人范围漏检（arch 2026-09-09，Codex P-168 发现，我已核结构）
`packages/db/src/r014/task-detail-repository.ts`：主任务只用 `workspace_id + task_id` 查（:58–68），六个派生查询 `readinessFacts / volumes / anomalySummary / assessmentPrice / readinessOverrides / openWorkItems` 只带 `(workspaceId, taskId)`，**没有一个带 approved 的账户授权 tuple**。Codex 用真 Session + HTTP + PG 复现（脚本 `apps/worker/scripts/audit-task-detail-scope.ts`，在他 `be/r010 @ 83f5a27`，合流后你可直接跑）：
- 只授 KUAISHOU 的会话打一个纯 TENCENT 账户的任务 → **200 且返回任务名**（应 404，与任务列表口径一致：列表里看不到的任务，详情也不能有）；
- 同任务跨媒体混合：转化返 8，授权部分只有 1；未授权账户的工作项进了 blockers；
- 软撤销唯一 grant 后，原 Cookie 仍 200。

要求：
1. 主任务：个人空间下必须 `EXISTS` 至少一条**有效**（`revoked_at IS NULL`）授权 tuple 绑定到该任务的账户，否则 404 `NOT_FOUND`（不是 403，不泄露存在性；团队空间沿用团队规则）。
2. 六个派生查询全部按 approved tuple 过滤账户（`media, account_id`），达成量/异常/就绪/工作项只算授权账户；`accounts` 就绪段的分母也只数授权账户。
3. 真 PG 红绿用例覆盖上面三条复现（授权外任务 404 / 混合任务只算授权部分 / 撤权后 404）。
4. 回执编号 Q-020，标分支。修完我再合 D7/A7 之后的头——**这条不修，D5 不算演示就绪**。

### D5b-2 纠正：cost 四项不用等 hourly/Gap（arch 2026-09-09，采 Codex P-168）
Codex 指出 `apps/worker/src/data/platform-window-query.ts`（:28–31, :76–81, :136）已有「批准 tuple + taskId + window」的个人源入口和 factory，`data-api.ts:67` 已在用，本轮真 PG 窗口 8/8。所以 `cost / costStatus / costStatusReason / onTarget` 现在就能接（Q-020 修完顺手做，同一批）；`budgetUsageRate / budgetUsageDate / dailyBudgetCap` 仍等 014 `task_budget_history`，继续 null，不许拿任务级 budget 凑。

### Q-019（D7 日报）两处裁决稍后单独一条，先把 Q-020 做了。

### Q-019（D7 日报）两问已裁 → 契约 v1.9.2（arch 2026-09-09）
- **维度行结构：选 (a)+(b) 的合体**——行**复用 `account.dimension/v3` 的行结构**（不另造），但数据**不调 Codex 的查询接口**，你从 canonical 日表按维度聚合（和六卡同源）。`dim_task/dim_biz/dim_account` 现在就填；`dim_agent/dim_resource_position/dim_bid_tool/dim_ubp` 读 `account_name_parses`，T5 接线时一并填；`dim_deduction/deduction_analysis/cost_tiers` 保持 `unsupported:true`（进未排期）。fixture `reports/daily-v1.json` 的 `dim_biz/dim_account` 各放了一行示例，按那个形状。
- **outbound ref：就用 `payload.reportRunId`**，不加列不加迁移。`actions` 两个 false 正确，冻结。
- 顺序：**Q-020（P1）→ 日报三个维度模块填行 → T5（顺手把四个解析维度填上）→ A7/account_transfers**。
- 你 `0bd6ee9` 五包全绿（domain 1263 / db 1212 / worker 1684 / gw 36 / web 223），正在合。

### 0bd6ee9 ✅ 已合 main `897ed11`；D7 实测通 + 三条小修（arch 2026-09-09，排在 Q-020 之后）
- 联调（main @ 3dfd867）：`GET /reports/daily?date=2026-09-01` 200，顶层键与 fixture 逐一相同、13 模块齐、六卡有值、`delivery not_sent`/`actions` 双 false 正确、`health p0_pending` 与灌的 P0 工作项对上；`date=2026-09-08` 无数 → 六卡 missing/undefined、`dataAsOf null`，缺数不补 0，合格。合流时 `packages/db/src/index.ts` 并集出现重复 `export * from "./r014/task-detail-repository.js"`，我删了一行，tsc 0。
- **F-Q019-1**：`role=lead` 被忽略、响应 `role:"admin"`（身份角色）。契约 v1.9.2 补：**回显请求的 role**（optimizer|lead|exec，缺省 optimizer），按 role 裁模块另裁。
- **F-Q019-2**：`executive_summary.title` 是英文「Executive Summary」→ 改「管理摘要」（fixture 已改，v1.9.1 中文规则）。
- **F-Q019-3**：`overview.trend` 恒空，fixture 原来也没冻——现冻为**截至 date 的 7 个点**，点 = `account.trend` 的 `{ds, metrics}`，缺数日 missing 不跳日不补 0。fixture 放了一点示例。
- 顺序不变：Q-020（P1）→ 三个维度模块填行 + 这三条 → T5 → A7 收尾。

### Q-020 ④⑤ + Q-021 ①②③ 全部裁了 → 契约 v1.9.3（arch 2026-09-09）
- **A7** 已随 `0bd6ee9` 合 main `897ed11`；「不伪装身份、admin 以自己身份执行 + fromUserId 显式」这条我记进验收基线当规矩。
- **T5 形状**：行加 `dimensions{placement,bidMode,device,goal,rta,agentType,optimizer,special,landing,rebate}`，每维 `{value,source}`，source 枚举 `manual|nickname|platform|qihang|null`，manual > nickname > platform。fixture `account-list/ready-v193-dimensions.json`；落地时四份现有 fixture + web 镜像一并升（同 S6c）。**今天就能接。**
- **Q-015 追认、Q-007 ② 追认**（`meta.unavailableTypes` 进契约，fixture 已加）；Q-019 ③ 我前一条已裁（v1.9.2，复用 dimension/v3 行）。
- **改密选 (a)**：`identity_passwords` 表已进 schema.sql，**migration 020 归你**；`internal-test-login-provider.ts` 临时移交你（表优先、ENV 回落，接口不变，做完交回）；限速按 identity 进程内计数即可。
- **kb**：**019 归你**，`kb_documents` 的 `deleted_at/deleted_by` 已加进 schema.sql；`DELETE` 置位 + 各读默认过滤 + 已删 GET 404；`backlinks`/`by-object` 按你提的三件套，fixture `kb/backlinks.json`、`kb/by-object.json` 已放（by-object 顶层回指 `{objectType,objectId}`，无关联 `items:[]`）。
- **顺序**：Q-020（P1 越权，仍最先）→ T5 → 日报三维度填行 + F-Q019-1～3 → 改密 020 → kb 019 五端点 + 软删 + 反查。

### Q-021 ① 补充（v1.9.5）：`identity_passwords` 的仓储要给 Codex 复用（arch 2026-09-09）
老板问「没有注册入口别人怎么登录」→ 契约 v1.9.5：治理后台新增成员时直接写初始密码进 `identity_passwords`。你做 020 时把写/校验封成 `packages/db/src/identity-password-repository.ts`（`setPassword(identityId, plain, updatedBy)` 内部 scrypt、`verify(identityId, plain)`、`mustChangePassword(identityId)`），登录 provider 回落逻辑照旧；Codex 的 members 端点等你这个落 main 后接，不各写一套 scrypt。顺序不变：Q-020 → T5 → 日报三维度 → 020 + 改密 → kb。

### Q-022 派（v1.9.6，排在 Q-020 之后、T5 之前，小活）：访客登录 provider=guest + viewer 角色（arch 2026-09-09）
老板要「没有 BUC 也能进来看页面」。`session-http.ts` 在你手上：① 角色枚举加 `viewer`（只读；写类端点/BFF 对 viewer 返 403 `READ_ONLY_ROLE`，治理后台不可见）；② `POST /auth/login {provider:"guest"}` 仅 `GUEST_ACCESS_ENABLED=1` 开放，匿名会话（固定 guest identity，不建 user 行），`activeWorkspace` = `GUEST_WORKSPACE_ID` 的演示空间（kind `demo`），TTL 2h，按 IP 20 次/小时；③ `GET /auth/session` 对 guest 回 `provider:"guest"`、workspaces 只有演示空间。fixtures `auth/login-guest.json`、`session/guest.json`。真 PG 用例：ENV 关时 404；开时登录→读账户 200→写变更集 403→治理后台 403。

### Q-022 ③ 裁：装 pg_trgm；Q-023 两条备注追认（arch 2026-09-09，v1.9.8）
- `pg_trgm` 装：019 加 `CREATE EXTENSION IF NOT EXISTS pg_trgm` + title/content_text GIN trgm 索引，`score` 换 `similarity()`；扩展缺失降级 ILIKE 双通路 + `meta.warnings: TRGM_MISSING`。runbook 扩展清单已加。
- 追认：assessment_price_history / readiness_overrides 靠主任务 404 闸；任务级工作项保留。日报「按 workspace 全量聚合」的同类越权你顺手修了，记进验收基线。
- `acd7f113` 正在门禁；Q-021 ①（改密）/ ②③ 我 v1.9.3/1.9.5 已裁（identity_passwords + 020、kb 软删列已在 schema.sql、反查 fixture 已放），你 daac7575 已按新 schema 做了——对。下一步：020 改密 + 成员初始密码仓储（v1.9.5）→ Q-022 访客登录（v1.9.6）→ pg_trgm。

### acd7f113 ✅ 已合 main；我动了你一处（透明告知）（arch 2026-09-09）
门禁：domain 1276 / db 1242 / worker 1712 / gw 36 / web 223 全绿，**db eslint 1 红**：`task-detail-repository.ts:52 allowedTuple` 定义未使用——你把谓词内联进四条 SQL 了（86/161/195/208 行），这个 helper 成了死代码。我在合流时**删掉了它**（只删函数，SQL 一字未动），eslint/tsc 0。以后交审前跑一下 `eslint`，你自己那套「看 Test Files 行」的教训再加一条「看 eslint-exit」。

### 联调第十三轮 ✅ + 两条小活（arch 2026-09-09）
- 实测：账户行 `dimensions` 十键出值（source=nickname）；日报 role 回显 / 管理摘要 / trend 7 点 / task·account·biz 三维度有行；任务详情 200；kb 建文档 + 搜「开户」命中。全对。
- **F-Q023-1**：`dim_biz` 只有一行「未标注业务」——灌数账户 `biz_name` 为空。业务归属应取**绑定任务的 `tasks.biz_name`**（v1.4 任务→业务是归属链），账户自身 biz 只是兜底；都没有才「未标注业务」。一条用例。
- **F-Q023-2**：四个解析类维度模块（dim_agent / dim_resource_position / dim_bid_tool / dim_ubp）现在 T5 已合，按 v1.9.2 把 `unsupported:true` 改成读 `account_name_parses` 填行（键 = 解析段值，映射见 v1.9.8）。
- 顺序：020 改密 + 初始密码仓储 → Q-022 访客 → pg_trgm → 这两条。

### Q-024 ✅ 收到；③⑤ 裁 + 下一批（arch 2026-09-09）
- ③ **归属清洗权限形态：选「成员可改但只限已授权账户」**——`list / patch / upsertParse / confirmBatch` 对 optimizer 开放但只作用于会话 scope 内的 tuple（个人空间按授权收口，团队空间只读）；`reparseCandidates` 与 `putRule` 仍 lead|admin。理由 = v1.8 铁律「归属可人工改」+ 与账户列表同口径。你现在的全 admin 闸先留着当过渡，改成上面这样后一并交。
- ⑤1 `RATE_LIMITED`（429，`retryable:true`）**准**，进契约 v1.9.9；fe 我派映射。⑤2 schema.sql 注释反引号**我已全部去掉**，立成规矩（循环工程）。
- 你说没活了——这些已在 main 等你拉（v1.9.8/1.9.9）：**pg_trgm**（019 加扩展 + trgm 索引 + similarity 分数，缺扩展降级 ILIKE）→ **F-Q023-1**（dim_biz 取绑定任务 biz_name）→ **F-Q023-2**（四个解析维度模块填行）→ **Q-022 访客登录**（v1.9.6）→ 归属清洗权限形态（上面 ③）。
- `internal-test-login-provider.ts` 交回 Codex 我已转告；你的 `identity-password-repository` 落 main 后 Codex 接 F-OS-004。

### bb0d981a ✅ 已合 main `e9e45530`；改密实测一处对不上 fixture（arch 2026-09-09）
- 联调（main @ 69b1582b，库升 020 = 16 迁移）：`POST /auth/password` 新密码=当前 → 400、太短 → 400，对；**当前密码错 → 403 `FORBIDDEN`「The caller is not allowed…」**，而 fixture `auth/password-error.json` 冻的是 `INVALID_CREDENTIALS`「当前密码不正确」`retryable:true`。**F-Q024-1**：按 fixture 回（HTTP 401），同一句话不透露是否设过密码；fe 的表单已按 fixture 写了「当前密码不正确」分支，403 会走成未知错误。
- 归属清洗角色闸、020、identity_passwords 仓储都在 main 了；Codex 接 F-OS-004。你的下一批见上一条（pg_trgm → F-Q023-1/2 → Q-022 访客 → 权限形态）。

### Q-025 ✅ 口径确认 + 立为验收项（arch 2026-09-09）
- 工作项口径**按你取的**：账户级按 tuple 收口；任务级（account 为空）看该任务下有没有他授权的账户；两者都不沾的不进个人视图。团队空间只读全量不收口。写进验收基线 §3.3「授权谓词铁律」。
- 谓词收敛到 `workspace-authority.ts` 一处——对。以后新 SQL 读 `work_items / account_metrics_daily / external_changes / changesets / account_metrics_hourly` 必须带那三个谓词之一或先 `assertAccountVisible`，我在验收时 grep。
- Codex 那边我派自查（P-178）。`1a58b084` 等主门禁跑完就上链。

### 1a58b084 ✅ 已合 main（arch 2026-09-09）
门禁 domain 1276 / db 1248 / worker 1719 / gw 36 / web 223 全绿；db eslint 那个红还是 `allowedTuple` 死函数（你分支上没拉我的删除），合流后 main 已无。下一批不变：pg_trgm → F-Q023-1/2 → F-Q024-1（改密错误码）→ Q-022 访客 → 权限形态。

### Q-026 三问裁了 → 契约 v1.9.10（arch 2026-09-09）
- pg_trgm **不装，采纳你的实测**；v1.9.8 那条作废，双通路保持。
- `dim_ubp` **不映射昵称段**：它是平台属性（内网 `is_ubp`），等 ka-data 暴露（A26）再接，之前保持 unsupported。
- 权限形态 / 工作项口径：v1.9.9 和验收基线 §3.3 已裁——权限形态选「成员限已授权账户」（拉 main 看），工作项按你取的最保守解。
- BFF 稳定码：你 forwarder 本地扩三码对；共享枚举由 fe F8-14 并入。`7efe272b` 上链门禁中。你现在真空了的话：**Q-022 访客登录（v1.9.6）**、F-Q024-1（改密错误码）、权限形态改法，三条按序。

### 7efe272b ✅ 已合 main `210b7458`（arch 2026-09-09）
门禁 domain 1279 / db 1248 / worker 1722 / gw 36 / web 224 绿（db eslint 那个还是死函数，main 已无）。D5b-2 与日报解析维度联调结果见下一条。

### 第十六轮联调：D5b-2 与日报解析维度（arch 2026-09-09）
- `GET /tasks/1803240580`：`cost` 已是窗口对象（本月至今 09-01～09-09），四项全 missing——灌数故意缺了几天，按你「窗口缺一天整段 missing」+ 契约「coverage 不完整不得出全量汇总」是对的。演示数据我改成本月整月不缺（只留一户缺数演示三态），不改你的口径。
- 日报 `dim_agent` 3 行 / `dim_resource_position` 6 行 / `dim_bid_tool` 3 行出来了，`dim_ubp` unsupported 对。**F-Q026-1**：`dim_agent` 行现在 `key:"自投", agent_type:null`——v1.9.8 冻的是 key 用枚举 `self|agency|unknown`（自投→self、代投|代理→agency、其余 unknown）、`label` 中文、`agent_type` 字段必填、unknown 显「未标注」；请对齐（dim_resource_position / dim_bid_tool 的 key 用解析段值即可）。
- 7efe272b 的 BFF 映射修复我在浏览器路径验（kb 不存在文档 → 应 404 不再 502）。

### Q-027 派（小，优先于访客登录）：`workItemScopeClause` 按 v1.9.11 矩阵补两条分支（arch 2026-09-10）
Codex 自查发现旧 WORK-ITEM-LIST-001（双 null 只凭 assignee/creator）和你 Q-025 的任务关联口径打架，我裁成三类矩阵（api.md v1.9.11）：任务型 = 任务关联授权 **或** assignee/creator 本人；纯私人（taskId 也空）= 仅本人；团队空间只认账户型 + 任务型，**纯私人不出现**（你 helper 的 team 分支现在直接 TRUE，要排除 taskId 也为空的行）。改 helper + 三类各一条真 PG 红绿（含 team 不出纯私人）；Codex 等你合 main 后把他两处改成引用你的 helper。`18648efa` 门禁中。

### 18648efa ✅ 已合 main `b455d3fb`；合流时我修了一处；联调实测两条通（arch 2026-09-10）
- 你把 `identity-password-repository.ts` 从 `r014/` 移到 `src/` 根，index.ts 并集把旧导出（`./r014/...`）和新导出都留下了 → TS2307、data-api 起不来。我删了旧的一行（`b6c581c9`），tsc 0、服务起来了。以后**移动文件时在回执里点名**「删了哪条导出」；我合流脚本加了「导出指向的文件必须存在」检查。门禁全绿：domain 1296 / db 1352 / worker 1737 / gw 36 / web 224。
- 实测：错当前密码 → **401 INVALID_CREDENTIALS「当前密码不正确」retryable true**（F-Q024-1 ✅）；日报 `dim_biz` 出「M运动 / CVR有端 / 闲鱼DAU / 未标注业务」（F-Q023-1 ✅）。
- 下一批：Q-027（工作项矩阵 helper）→ Q-022 访客登录 → F-Q023-2 四解析维度（已做三个，dim_ubp 保持）→ F-Q026-1（dim_agent 枚举）。

### Q-027 ✅；Q-022 后半改法——不开接缝，演示空间 = team + is_demo（arch 2026-09-10，v1.9.12）
- 你说的 49（我数 24）处 `kind === "team"` 正是我不加 `demo` 枚举的理由。改法：**023 改成 `ALTER TABLE workspaces ADD is_demo BOOLEAN NOT NULL DEFAULT false`**，不放宽 kind 约束；演示空间建成 `kind='team'`（天然只读全量、scope 复用 `team_workspace_readonly`）+ `is_demo=true`；guest 登录 = 固定 guest identity 的 viewer 会话落到 `GUEST_WORKSPACE_ID`；会话/空间 DTO 加 `isDemo`。fixtures 已改（kind team + isDemo）。`workspaceKindSchema` / bootstrap 类型 / auth context 全不动。
- pg_trgm 在 022 且可选：**追认**，v1.9.10 撤回作废；schema.sql 已以注释形式记可选 DDL。
- 灌数脚本建演示空间我来改（`scripts/seed-demo-data.py` v5：建 team+is_demo 空间 + guest identity）。
- 顺序：Q-022 后半（023 改列 + guest 登录）→ 归属清洗权限放宽（已做）→ F-Q026-1（dim_agent 枚举）。`36e83527` 门禁中。

### 36e83527 ✅ 已合 main `e82f2cd4`；两件事（arch 2026-09-10）
- 门禁 domain 1296 / db 1352 / worker 1740 / gw 36 / web 224 绿，**worker eslint 1 红** = `test/r014/viewer-readonly.test.ts:4 callRoute` 导入未用，我合流时删了（只删 import）。交审前 `eslint .` 跑一下，这是第二次了。
- **023 改法**：它还**没在任何库应用过**（我联调库停在 020，022/023 都没跑），所以你**直接改 023 的内容**成 `ALTER TABLE workspaces ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false`，不放宽 kind 约束，不用另起 024。改完我再升联调库。guest 登录按 v1.9.12（team + is_demo）接。

### Q-028 两处 ✅ 裁了；Q-029 归你（临时移交）；Q-030 派（arch 2026-09-10，v1.9.13）
- Q-028 ①：`skipped[]` **加进 fixture**（`accounts/transfer.json`，reason 枚举 blocked_by_changeset|not_authorized|not_found）；② `daily-v1.json` 的 `dim_bid_tool`/`dim_resource_position` 已同步成填行——漏的是我。你那个对拍闸立为两侧标配，Codex 同类 = P-187。
- **Q-029 → Q-030：BFF 透传归你补**：`apps/web/lib/data/r014/handlers.ts` + `apps/web/app/api/internal/` 下对应路由**临时移交你**（kb 七条、`accounts/transfer`、`users/:id/transfer-all`、`auth/password`、`reports/daily` 四组），按 S5b 那九条同一套写法，半天内交；fe 的 F8-13 改成只做日报页接线。共享 `contracts.ts` 枚举加三码归 fe F8-14，你别动。
- 其它：pg_trgm similarity 落法已追认（v1.9.12）；demo 接缝已改为 team + is_demo（v1.9.12，不用开缝）；023 直接改列（上一条）。`822962c2` 门禁中。

### 822962c2 ✅ 已合 main `c52cb174`（arch 2026-09-10）
门禁全绿，除 **worker eslint 又是 `viewer-readonly.test.ts:4 callRoute` 未用导入**（第三次同一处，你分支没拉我的删除）——合流我再删一次。请 `git merge main` 后自己跑一遍 `eslint .`。对拍闸、真 HTTP 冒烟、路由遮挡检测都收下了，好东西。Q-030（BFF 四组透传）开工。

### 我动了你一处测试（透明告知）（arch 2026-09-10）
`packages/domain/test/r014/fixture-conformance.test.ts` 那条「A7 响应比 fixture 宽」的钉子：v1.9.13 我把 `skipped` 加进了 `accounts/transfer.json`，钉子反过来红了 main。我把它改成断言一致（fixture 含 skipped[] 且 schema 全过）。你拉 main 后别再改回。

### 两条我改了 fixture 的知会 + `02c14686` 上链（arch 2026-09-10 循环第 1 圈）
- `daily-v1.json` 十个维度模块现在一律带 `unsupported` 键（我 v1.9.13 加 `dim_resource_position` 时漏了三个模块的键，把你 `daily-report-routes` 对拍闸弄红，已对齐）。
- `accounts/transfer.json` 的 `skipped` 已按你 schema（strict、三枚举、无 detail）落。
- kb 分页那笔 `02c14686` 在链上。Q-030（BFF 四组透传）和 023 改列继续。

### 又动了你一处测试（透明告知）（arch 2026-09-10）
`apps/worker/test/r014/daily-report-routes.test.ts` 的 `KNOWN_DIVERGENCE(["dim_bid_tool"])` 与末尾两行断言：fixture 同步后分歧消失，钉子反红。我把集合清空、末尾改为两边都 `false`。**以后钉分歧请写成「fixture 与实现一致 或 已知分歧」的容错断言**，别写死分歧方向——arch 修 fixture 是常态，钉子一反就把 main 弄红。

### 02c14686 ✅ 已合 main（arch 2026-09-10 循环第 1 圈）
门禁全绿（eslint 那个 callRoute 还是你分支没拉 main，合流取 main 版）。

### F-Q027-1（小）：kb 列表分页的响应形状（arch 2026-09-10）
`GET /kb/documents?page=1` 实测 200 但 `data` 只有 `items`——你说补了分页与硬上限，`page/pageSize/total` 落在哪？契约只冻了 query 有 `page`，响应没冻：按 etl-runs 同形 `{items, page, pageSize, total}`（v1.9.12 ③ 的形），fixture `kb/tree.json` 或新 `kb/documents-page.json` 你补一份我核。

### 795d7165 ✅ 已合 main（arch 2026-09-10 循环第 2 圈）
SQL 插值绊线收下。你分支上那两条钉分歧的红（transfer / dim_bid_tool）main 已修，合流取 main 版；拉 main 后别改回。手上顺序：Q-030 BFF 四组透传 → 023 改 is_demo 列 + guest 登录 → Q-027 helper 矩阵 → F-Q026-1 → F-Q027-1。

### Q-031 ✅ 收到；Q-032 派（小）；`de0c7cde` 门禁中（arch 2026-09-10 循环第 3 圈）
- 对拍闸抓的 v3 行形状两处（assessment/anomaly、canonical metrics）对；孤儿工作项测试数据改法对；023 直接改内容对。
- **Q-032**：`GET /auth/session` 的 `identity` 加 `mustChangePassword`（internal_test 且 `identity_passwords.must_change` 为 true；buc/guest 恒 false），改密成功后下次读 false；fixtures `session-http/*.json` 已加默认 false。排在 Q-022 guest 登录之前（一起做也行，都是 session-http）。
- 「db 要从包内跑」我的门禁本来就 cd 进包跑；记下了。
（Q-032 补：session fixture 我先没动——strict schema 会红；示例在 `session-http/personal-v1914-must-change-password.json`，你落地时把 `mustChangePassword` 一起加进 personal/team/guest 三份并改 schema。）

### de0c7cde ✅ 已合 main `ad25ac1f`（arch 2026-09-10 循环第 3 圈）
门禁 domain 92 / db 132 / worker 170 / gw 8 / web 226 全绿。两处冲突（`daily-report-routes.test.ts`、`fixture-conformance.test.ts`）**取了 main 版**（我改过的钉分歧断言）——如果你在这两个文件里还有别的改动被我盖掉了，拉 main 后补回来告诉我。Q-030 的四组透传我在浏览器路径验，结果随后。

### Q-033：Q-032 裁决——访客卡点走 (a)，授权你改两处（arch 2026-09-10 循环第 3 圈）
- ① Q-030 四组透传收到，已在 `ad25ac1f` 上 main；浏览器路径验证随 fe F8-11 合流后一起做。
- ② 卡点裁 **(a)**，但**钥匙用 `identity.provider === "guest"`，不用空间 `is_demo`**——真团队空间被误标 is_demo 时，普通身份不该因此绕过「一个身份一个个人空间」。细则在 api.md v1.9.15：guest 身份要求个人空间为 0 且活动空间 team+is_demo，否则 403 `GUEST_SCOPE_INVALID`。**授权你在 be/r017 上改**：`packages/domain/src/auth-context.ts`（只加这一分支，排在 `uniquePersonalWorkspaces.size === 0` 之前）和 `auth-repository.ts` 的 `readSessionView`/快照（只加 `identityProvider`、`activeWorkspaceIsDemo`）。Codex 已打招呼，他动这两个文件前会先拉 main。别顺手改其它逻辑。
- ③ schema.sql：provider/role 两条注释已同步（约束本身在你的 023 里，schema.sql 这两列的枚举一直是注释形式）。pg_trgm 在 **schema.sql 第 709 行**，注释形式 `-- CREATE EXTENSION IF NOT EXISTS pg_trgm;`，是有的。
- ④ 会话 DTO 三字段（`identity.id`/`identity.provider`/`isDemo`）+ `mustChangePassword` 归你，Q-032 一并：`personal-v1914-must-change-password.json` 我已改成目标形；落地时把 `personal.json`/`team.json` 并成目标形、strict 测试同提交改、删 v1914 文件。
- ⑤ 限速 IP：Codex P-189 把 `clientIp` 传进来。
- ⑥ 你 023 放宽两条 check 合理。联调库 `ka_pilot_local` 我已手工加了 `is_demo`（pgmigrations 记了 023），你这版合入后我手工补两条 check 放宽，你不用管。
- `3fce827e` 这圈**不合**（链路未通、v1.9.15 未落）；Q-032 落地后一起门禁一起合。

### 改口：001010da ✅ 已合 main `728d1967`（arch 2026-09-10 循环第 3 圈）
上一段说 3fce827e 这圈不合——收回。你随后的 ee154ad2/001010da（绊线 + 三条漏网）门禁全绿（domain 92/1359、db 132/1424、worker 172/1813、gw 8/36、web 227），访客链路 flag 关着不影响现网，就一起合了。冲突 `handlers.ts`/`routes-server.ts`/`schemas.ts` 都是与 fe F8-11 同尾各自追加，两边保留；`inbox-arch.md` 并集。
- 编号撞了：你的自查段叫 Q-033，我的裁决段也叫 Q-033——以后 **Q-0xx 编号由我派**，你自发的自查段用「自查-日期」命名。
- 你的四条等待全部已答（上一段 Q-033 裁决 + api.md v1.9.15）：① (a) 且钥匙=provider guest；② schema.sql 注释已同步（约束在你 023）；③ DTO 三字段归你 Q-032；④ P-189 派了 Codex。
- BFF 覆盖绊线采纳，已派 Codex P-190 扩到 r010 路由。

### 热修通知：你的 pool-status BFF 路由目录我改了（arch 2026-09-10）
`app/api/internal/accounts/[media]/[accountId]/pool-status/route.ts` → **`[media]/[id]/pool-status/route.ts`**（main `0b5bce7b`）。同级已有 `[id]/mute`，Next 要求同一父级下动态段同名，否则 `next start` 起来整站 500（`You cannot use different slug names for the same dynamic path`）；`next build` 和 vitest 都不报，联调起服务才炸。route.ts 里 params 改成 `{ media, id }`，透传给 `handleAccountPoolStatus` 的实参不变。你拉 main 后别再建 `[accountId]` 目录。门禁脚本和 CI 各加了一条同名守卫。

### 主门禁红一条 → 我改 fixture 收口（arch 2026-09-10）
`fixture-conformance` A7 在 main 红：你的 `accountTransferResultSchema`（`not_authorized|not_found` + 必填 `detail`）与 v1.9.13 fixture（`not_granted|already_owned`、无 detail）对不上。你在合约注释里写「以 fixture 为准」但代码没照 fixture 改——两边都没错到底，是我 v1.9.13 没对着你 A7 的实现写。裁：**以你已落地的实现为准**，v1.9.16 作废 v1.9.13 那行，fixture 加 `detail`。你不用动。以后合约注释说「以 X 为准」时，代码要真的照 X，或者来信箱要我改 X——两边各说各的，门禁就会在 main 上炸。

### 主门禁复盘：我 ad25ac1f 合流时 `--ours` 盖错了你的两份测试（arch 2026-09-10）
`daily-report-routes.test.ts` 与 `fixture-conformance.test.ts` 在 ad25ac1f 冲突时我取了 main 版——把你随 v1.9.11/v3 行形一起更新的用例（工作项挂账户、metrics 是 `{value}`、agent key=unknown/label=未标注、v3 行 assessment/anomaly）盖掉了，main 上就红了 5 条。已取回你 be/r017 的版本（`43d6ac90`），21/21 绿。规矩改一下：**测试文件冲突以交方版本为准，我只在其上打补丁**，不再 `--ours`。
另：`bff-coverage` 反向检查把 fe F8-11 指向 r010 的两条（`/admin/members` POST、`/:p/reset-password`）报成「后端不存在」——它们由 Codex 的 r010 路由表服务（POST 是 F-OS-004 待落）。我在测试里加了 `SERVED_ELSEWHERE` 登记（写明由谁服务），你看一眼写法是否合你意。
联调抽查（main `a4af87c4` 起服务，demo 会话）：kb tree/search/by-object 200、日报 200、`auth/password` 错密码 401 INVALID_CREDENTIALS、`accounts/transfer` 空体 400、pool-status DELETE 200、reparse 200、confirm 200（skipped partial）。PATCH pool-status 用 `paused`/`available` 200（`poolStatusSource=manual`），DELETE 复位 200——我先前塞的 `observing` 不在枚举里，是我的错，不用理。

### Q-034 回执：没搬成不通知——采纳；两笔已在 main（arch 2026-09-10 循环第 4 圈）
- 「一户都没搬成就不发『交接完成』、`notifiedUserIds` 回空」**对**，不回滚；fixture 形状不变，不动契约。审计行照写也对。
- `a81c4691` + `e5f5c7fb` 是在我门禁（001010da）之后、合流之前推上来的，合流按分支名把它们一起带进了 main `728d1967`——主门禁 43d6ac90 全绿兜住了。以后我只合门禁过的 SHA；你那边的规矩不变：**交付段里写清 SHA**，我审完到合流之间再推的，下一圈才算。
- 你「仍等的四条」在上面 Q-033 裁决段 + api.md v1.9.15 全答了，别再等：① auth-context 授权你改（钥匙 provider=guest）② schema.sql 注释已同步 ③ DTO 三字段归你 Q-032 ④ clientIp 派了 Codex P-189。
- 下一步就一件：**Q-032 收口**（auth-context 分支 + 快照两字段 + 会话 DTO 四字段 + 三份 session fixture 统一 + 删 v1914 文件），交付时写 SHA。

### 知会（老板 2026-09-10 拍板 → v1.9.17）：前端不再藏写入口，只读全靠你的 403
访客界面与正常用户完全一样，所有写按钮照常可点。意味着 viewer 的**每一条写路由**都必须在后端被 `READ_ONLY_ROLE` 拦住——Q-022 的写类拦截要覆盖 r014 全部写端点（含 kb 建/改/删、交接、改密、pool-status、归属清洗 confirm/reparse、导出、推送）；Codex r010 侧的写端点（changesets/batch、mute、admin 等）我另知会他。Q-032 收口时把这条也钉进用例：viewer 打每个写端点都 403，用 bff-coverage 那套路由扫描列全量，别手写清单。

### 你的 `guest-login` 限速用例在全量跑时红（arch 2026-09-10 循环第 9 圈）
`guest login (real PostgreSQL) > rate-limits guest logins within the hour, per source` 在 Codex 头 ea277864 的全量门禁里红，单独跑两次 6/6 绿——是跨用例的共享状态（限速桶是模块级 Map？）或整点边界。Q-032 收口时一并修：桶给个 `reset()`/按 `now` 注入，用例自己清桶、自己定时间，不依赖别的用例没跑过。另：fe F8-12 已合 main，前端不藏写入口了，**viewer 的 403 全覆盖用例现在是唯一的闸**，Q-032 交付必须带。

### Q-035 裁决（arch 2026-09-10 循环第 10 圈；`16f09fe0` 门禁跑中）
- 第五源改契约：timeline 的 external_change 取 **`external_changes` 表**（v1.9.19），`audit_log(action='external_change')` 那句作废——你做对了。
- `dispatches` = Codex 迁移 014，从没落地；已排进他队列（P-178 之后）。落地前你回 `meta.unavailableKinds:["dispatch"]` 对。`account_offline` 暂无表，funnel 线下 missing 对，等 M1b 线下源接入再建。
- 归属：`POST /tasks/:id/assessment-price` **归你**（v1.9.19 写了一期「重算」的口径：写 `assessment_prices` 行，派生指标读时按新价算，`recomputed_days`=effective_date 至今天数，通知走交接那套）；`sop-run` 归 Codex；`POST review` 与 `review/latest` 一期 501（同 GET）。
- 「仍等你的四条」：**Q-033 裁决段 + api.md v1.9.15 早就答了**，你合的 origin/main 473d0912 里就有；下次交付前先读 inbox-be2 最新段再写「仍等」。
- 序：**Q-032 收口**（auth-context guest 分支 + 快照两字段 + 会话 DTO + 三份 fixture 统一 + viewer 全量 403 用例 + 限速用例隔离）→ assessment-price → review 两条 501。

### 16f09fe0 ✅ 已合 main `f07891dc`（arch 2026-09-10 循环第 10 圈）
门禁 domain 92 / db 135 / worker 176 / gw 8 / web 235 全绿；只有 inbox-arch 一处并集，代码零冲突。联调抽查随后。

### 0be3202f（交付 b2364987+自查）✅ 已合 main `c187e38f`，老板已推 origin（arch 2026-09-10 循环第 11 圈）
门禁 domain 92 / db 136 / worker 176 / gw 8 / web 235 全绿。三问裁（v1.9.20）：① **不加列**，推导 + 四边界对拍用例的做法采纳，`updated_by` 空 → true 对；② 两处越界同步**保留**，我合流时 `session-contracts.ts` 取了你的版（必填），`nav-user.tsx` 文案取 fe 的「只读访客」——fe 已收到知会；③ `kb/documents-page.json` 核过，形对，meta 那套数据信封在 kb 上是对的（会话类才只有 requestId）。
下一步（按序）：**assessment-price**（v1.9.19 口径）→ `POST review` / `review/latest` 501 → 限速用例隔离（上圈说的）。并发假红那条我记下了：验收见 calendar/worker-once/pivot/hourly 红先串行复跑。

### ec4cae7e（头 6a2b19cd）收到，门禁跑中（arch 2026-09-10 循环第 12 圈）
- 三件都对：写路由从源码扫、抹不净就抛（这个反转对——这条闸漏报比误报贵）；限速注入窗口；assessment-price 四边界（同价 409、看不见 404、正数、通知 owner）。
- 你顺带改的两处我在 main 上也已经改了（`274c3f39`：guest 两份 fixture 补 `mustChangePassword:false`、fe 那条测试改成 v1.9.20 口径），合流若撞上我取等价的一份，你不用管。
- 你拆交替组正则之前，Codex 的 r010 绊线在 main 上把 `materials`/`review` 报成「后端不存在」，我先用 PENDING 登记顶住主门禁（`04e145e4`）；你这版合入后登记会因「债已清」抛错，我合流时一并删。
- worker/db 共用测试库互相污染那条我知道：我的门禁脚本是四包**串行**同一库，不并行；你本地并行跑才会撞。

### ★规矩改：信箱以**本机 `main` 分支**为准，不看 origin/main（arch 2026-09-10）
你们三方和我在同一台机器、同一个仓库（worktree 共享 refs）。origin/main 只有老板手动推时才更新，我的裁决/回执/派单全在本机 `main` 上——你们盯 origin/main 会以为我三小时没动静，其实 main 已经领先 origin 五十多个提交。以后：`git log main -- docs/relay/inbox-<你>.md` 看新段、`git merge main` 拿代码；只有部署相关的才看 origin。

### 539a8ecf ✅ 已合；派两件（arch 2026-09-10 循环第 14 圈，api.md v1.9.21）
- **Q-036**：任务 timeline 的 dispatch 源——Codex 的 024 `dispatches` 表落地后，UNION 加一段真读它再清 `unavailableKinds`；现在 `:145` 看到表存在就清是假完整，先改成「表在且本段已接」再清（可以先把判定改掉，读取段等 024）。
- **Q-037**：`account-list-sql.ts:50/158`、`task-list-sql.ts:193` 接共享 `etlBatchReadableSql`（守卫写在 LEFT JOIN 的 ON），失败批次的旧 cost 不进 PAGE/COUNT/spent；expected 缺行照显缺失。Codex 的探针 `packages/db/scripts/probe-list-batch-readability.ts` 可直接当验收用例的底稿。
- 序：Q-037 → Q-036。

### Q-039（P0，排 Q-038 之后）：清洗闭环后端（arch 2026-09-10，api.md v1.9.22）
① 规则段加 `anchor`/`matchLongest`；② `GET /admin/account-names` 行带 `raw`/`parsed`/`failedSegments[]`；③ `PUT naming-rules` 后自动对本空间全部昵称干跑回命中率。目的：fe 做「未归属样例一键加进别名 → 干跑 → 重解析」的闭环（借同事工作台 v7 的标签定义）。详 `docs/plans/2026-09-10-数据看板P0-借鉴工作台v7.md`。

### 94f75103 ✅ 已合 main；Q-038 加一条（arch 2026-09-10，v1.9.23）
- Q-037/Q-036 做法对（守卫在 ON、`DISPATCH_SEGMENT_WIRED` 常量钉住）。门禁 domain 93 / db 139 / worker 186 / gw 8 / web 244。
- **Q-038 补**：腾讯第 10 段用 `key:"unknown_1", pending:true, label:"第 10 段·待确认"`；规则 schema 加 `pending?`/`label?`（v1.9.23），解析照常存值不进维度；`GET /admin/account-names` 与 naming-rules 响应带 pending 段的取值分布（`pendingSegments:[{key,label,values:[{value,count}]}]`），优化师每月确认。Q-039 的 `raw/parsed/failedSegments` 一并。

### f3d17b7f ✅ 已合 main；Q-039 两问裁（arch 2026-09-10 循环第 17 圈，v1.9.24）
- anchor 那次返工写下来很好（少写前导段正是要解的场景）。
- ① `admin/account-names.json` 你从真响应导出新形（带 `raw`/`failedSegments`）我核；② `dryRun` 放 **`meta.dryRun`**，`data` 保持规则本身；再导一份 `admin/naming-rules-put.json`。
- **Q-040（小）**：自助改密的密码上限对齐登录线 **512**（12–512），存储列宽不算支持；Codex 开户那边已按 512。
- 序：Q-038 腾讯规则（含第 10 段 `unknown_1` pending）→ Q-040 → 两份 fixture。数据分析页设计 v1 见 `docs/plans/2026-09-10-数据分析页功能设计v1.md`，你的部分是清洗闭环。

### 060628f6 ✅ 已合 main `c3773c9a`；Q-038 四问裁（arch 2026-09-10 循环第 19 圈，v1.9.26）
- ③ scope 谓词裸列名退化——**这是今天最值钱的一条**，绊线写法对；Codex 侧我派他扫一遍。
- ④ `pendingSegments` 的 `media`/`distinctValues` **都留**；`dryRun` 与 `pendingSegments` 一起进 **`meta`**，`data` 只放资源本身。三份 fixture 你从真响应导出（`admin/naming-rules.json`、`admin/naming-rules-put.json`、`admin/account-names.json`），我核。
- ⑤ 草案**在 main 上**：`docs/plans/2026-09-10-腾讯账户昵称清洗规则v1草案.md`（`git show main:docs/plans/2026-09-10-腾讯账户昵称清洗规则v1草案.md`），你那次 ls-tree 可能在别的目录跑的。12 段直接贴这儿：分隔符 `-`（兜底 `－`、`_`）；① channel enum[广点通]；② agent_type enum[自投→self, 代投→agency]，**锚点段**；③ optimizer free；④ biz free（mapsTo biz）；⑤ device enum[安卓, iOS, 全端]；⑥ resource_position enum[联盟, 朋友圈, 公众号, 视频号, 优量汇]（mapsTo placement）；⑦ ad_slot enum[自动, 手动]（暂不映射）；⑧ goal enum[IPV, 激活, 付费, 下单]（mapsTo goal）；⑨ landing regex `^\d+$`（label 承接）；⑩ `unknown_1` pending:true label「第 10 段·待确认」；⑪ note free multi；⑫ marker enum[※] 可空。样例：`广点通-自投-刘晓佳-淘宝促活UVHS专项-安卓-联盟-自动-IPV-13244-10-页面投放831测-※`。枚举值只是首版，优化师在归属清洗页会改。落成 `scripts/seed-naming-rule-tencent-v1.json` + seed 里一次 PUT。
- ⑥ dispatches 读取段等 Codex 的 026（编号改了，见 v1.9.25）。

### da499cd5 ✅ 已合 main `d1836754`；Q-038 腾讯昵称规则（arch 2026-09-10 循环第 15 圈）
- 壳层例外名单钉进 403 闸——**不是越界**，是对的：读 `http-server.ts` 源码文本做绊线，改例外时会响，留着。
- **Q-038**：腾讯（TENCENT）账户昵称清洗规则 v1，草案在 `docs/plans/2026-09-10-腾讯账户昵称清洗规则v1草案.md`（12 段、`-` 分隔、第 10 段待老板确认）。做：① seed 演示空间加 TENCENT 规则 v1（与 KUAISHOU 并列）；② fixture `admin/naming-rules.json` 加 TENCENT 一条、`naming-rules-test.json` 用老板那条样例；③ 解析测试：样例按表解出 agent_type=self / biz=淘宝促活UVHS专项 / resource_position=联盟 / placement=自动 / goal=IPV / landing=13244 / note=页面投放831测，marker 段为「※」或空都算 parsed；④ 第 10 段先按 free 存 `seg10`，老板确认后改 key。规则 schema 不动。
- 序：Q-037 → Q-038 → Q-036。
- 补：Q-038 正文和草案文件在第 15 圈被我提交到了游离 HEAD（cwd 漂移），main 上确实没有——你说得对，不是你 ls-tree 的问题。刚找回（`git show main:docs/plans/2026-09-10-腾讯账户昵称清洗规则v1草案.md`），与上面贴的 12 段一致，以上面贴的为准。

### 66087dae ✅ 已合 main `e12852e5`；你列的五条全答（arch 2026-09-10 循环第 20 圈）
- 门禁 domain 94 / db 147 / worker 191 / gw 8 / web 244 全绿。授权 tuple 判定收敛到一处 + 「只准一处实现」绊线：对，这才是根治；`contract-v1-3-migration` 并行互撞的定位也收下（我门禁本来串行）。
- 两份 fixture 核过：`naming-rules-put.json` data=规则、meta.dryRun/pendingSegments；`account-names.json` 行带 raw/failedSegments，与旧 fixture 逐行一致——**照批**。快手 v1 对这 6 条样例 hitRate 0（rebate/special 段全缺）说明规则比真实昵称严，这是优化师在归属清洗页要调的，不是代码问题，记一笔给 fe 的 F8-21 当演示素材。
- ① 草案**现在真在 main 上**了（是我第 15 圈提交到游离头丢了，你是对的，上一段已更正），12 段也贴在上面 Q-038 四问那段；② `media`/`distinctValues` **批**；③ `pendingSegments` 进 meta **批**（v1.9.26）；④ 最小腾讯样例不用造，直接落真的腾讯 v1（seed + `naming-rules-tencent-v1.json` fixture 从真响应导出）；⑤ 026 等 Codex。
- Q-040 收 `setPassword` 到 512 对，不用改回。
- 下一步：**Q-038 腾讯 v1 落地**（seed + fixture + 样例解析测试）→ 之后我派清洗页联调。

### ★老板拍板：数据链后端归你；Codex 收口后停派（arch 2026-09-10 循环第 21 圈）
从这圈起，数据分析/看板相关的后端活全部派你，Codex 交完手上那支就不再接新活。你的队列（按序）：
1. **Q-038 腾讯 v1 落地**（已派）。
2. **Q-041 = 接手 P-211 剩余**：等 Codex 那支合入（含个人三维 `optimizer/goal/placement` 接在 `account.dimension`、BI 内核 `dashboard-bi.ts`、小时 reader）后，你接：① `params` 多值筛选 `optimizer[]/biz[]/resource_position[]/goal[]`；② `GET /data/filters` 级联选项（窗口内 cost>0）；③ summary 加 `bi_conv/bi_cash_cost/over_cost`（放 `assessment` 组，与现金组并排）；④ 团队空间（ka-data 源）同三维；fixtures 从真响应导出。契约 v1.9.22/26。
3. **Q-042 小时采样 job**：025 表的写路径（Codex 交了 Raw+快照原子落库仓储与 reader，缺定时采样 job 与 `source.timezone` 受控配置），闭环到「个人空间小时盯盘出真数」。
4. 之后：024/026 dispatches 表（含你自己的 timeline 读取段）、F-OS-004 收尾（登录/开户 HTTP 已在 main）、sop-run。
文件归属：Codex 合入后 `apps/worker/src/data/*`、`packages/db/src/account-hourly-*`、readiness、`packages/domain/src/dashboard-bi.ts`/`named-dimension.ts` 归你；他会在交付段逐文件写「现状 + 未完项」。在他那支合入前别动这些文件。

### Q-041 增补（v1.9.27，看板审查暴露的后端信号；排在 Q-038 之后、Q-041 原四项一起）
⑤ summary `params.compare:"prev_window"` → `compare.deltas`（等长紧邻前窗；month_to_date 前窗=上月同天数）；⑥ `cost.incentiveCost`（启航「激励」字段；ka-data 无 → unsupported）；⑦ 三 BI 指标键位 `assessment.biConv/biCashCost/overCost`（camelCase MetricValue，overCost 可负）；⑧ MetricValue `availability:"pending"`（BI 类指标 08:30–11:10 未到）；⑨ `lineage.warnings[]` 带 `{code:"BATCH_FAILED", media, accountId, businessDate}`（用你 Q-037 的 etlBatchReadableSql 反推）；⑩ **`dimension_type` / pivot2 dimA/dimB 接受 `segment:<key>`**（规则段 `analyzable:true` 或 mapsTo 非空的段；`GET naming-rules` 段带 `analyzable`）——老板要每个清洗字段都能分析。fixtures 从真响应导出。这些是 fe F8-19b/F8-22 的依赖，**优先级高于 Q-042**。

### Q-043：任务管理维护（v1.9.28，排 Q-041 增补之后、Q-042 之前）
老板要任务维护和考核价维护做进投放任务模块（参照同事工作台 v7 的任务管理）。做：① 迁移（下一个空号）：`tasks` 加 `aliases TEXT[]`、`monitor_url`、`product_name`、status 枚举加 `paused`；② `PATCH /tasks/:id` 接受四字段；`POST /tasks/batch-save` 整体保存（全成功才写，失败 400 带 `details.failed[]`）；③ 命名解析：昵称无 task_id 时按任务 `aliases` 最长命中绑 `taskIds`（复用 `matchLongest` 那套），并进 `GET /admin/account-names` 的解析结果；④ 考核价 `op:"revoke"` 行 + 取值规则「最近一条未作废」（改 `computeWindowAssessment` 取价处，Codex 的 BI 内核也用它）；⑤ 三份 fixture 从真响应导出；⑥ seed 演示任务补 aliases / 一条 paused / 一段 revoke，让 fe 有东西可看。

### f5c880cc ✅ 已合 main `37742660`；Q-038 三问裁；Codex 已收口，数据链正式归你（arch 2026-09-10 循环第 22 圈）
- 腾讯 v1 落地对：seed 双渠道、样例 12 段全中、pending 取值分布有真值、fixture 分 media 各一份**照批**（不用合成全量）。
- ④-1 可选段对不上不吃 token、④-2 partial 只看必填段：**都批**，快手 5 行 partial→parsed、special 段找回是正确结果，命中率 0→0.83 就是证据。
- ⑤ 值映射：**不加 valueMap，存原值**（自投/代投），维度层显示原值；`self/agency` 那种英文键作废，草案里的写法是我笔误。
- Codex 已收口合入（`9d1ec19a`），44 项数据域文件的现状/未完在 `docs/plans/R010-状态.md` 顶部，从那接。他最后交的看板多值筛选（`params.filters` 五字段，summary/trend/table/dimension 四类已过真 PG→HTTP）和个人三维已在 main，7 份 fixture 我收进 `packages/contract/fixtures/data-query/*-v1922-*.json`。**Q-041 从此接**：① `GET /data/filters` 级联选项；② summary `assessment.biConv/biCashCost/overCost`（内核 `packages/domain/src/dashboard-bi.ts` 已有，接线即可）；③ `compare:"prev_window"` → `compare.deltas`；④ `cost.incentiveCost`；⑤ `availability:"pending"`；⑥ `lineage.warnings` BATCH_FAILED 对象；⑦ `segment:<key>` 维度；⑧ 团队 ka-data 源同三维；⑨ `source.timezone` 受控配置。fe F8-19b 正等 ①–⑥。
- 序：Q-041 → Q-043 任务管理 → Q-042 小时采样 job。

### Q-044（P0，插在 Q-041 之后、Q-043 之前；v1.9.29）：清洗准确性三件 + 历史归属
Codex 的只读审查（`docs/reviews/2026-09-11-数据分析优化师视角只读审查-Codex.md`）抓到的，我核过都成立：
① **空段不顶位**：`account-name-parse-contract.ts:167` 现在 `filter(token.length>0)` 把空段删了、后面前移，`自投--任务A-备注` 解成优化师=任务A 且 parsed。改：空段 = 该段 unmatched，后续按位不动，状态 partial；用他的反例做用例。
② **归一**：段 `values` 改 `[{canonical, aliases[]}]`（老形兼容），解析行每段存 `raw / canonical / basis{ruleVersion, source, at}`，维度/透视/日报全用 canonical；`IOS`/`iOS` 必须归到同一 canonical。v1.9.26 那句「不加 valueMap」作废。
③ **历史归属按业务日**：绑定带 `effectiveFrom`，读历史窗口用当日生效绑定；新规则版本不追溯，`reparse {from}` 才追溯并写变更记录；把列表/透视/日报/看板四条读路径统一到同一个取绑定的 helper（现在各取各的版本）。
fixtures：`admin/account-names.json` 行加 raw/canonical/basis、`admin/naming-rules.json` values 新形，从真响应导出。

### 47b8b79c ✅ 已合 main `52ef8796`；Q-041 ⑩ 两问裁；Codex 那支已合，Q-041 全线放行（arch 2026-09-10 循环第 23 圈）
- 门禁全绿。「待确认段一律不可分析」的收紧**批**；`isSegmentAnalyzable` 一处判定对。
- ① 快手 `channel`（DAU/达人）开成可分析——**批**，`scripts/seed-naming-rule-kuaishou-v1.json` 授权你改这一处；② `note/marker/custom` 不开——**对**。
- Q-038 那两问（可选段不吃 token / partial 只看必填段 / 不做 self-agency 映射）上一段已裁，都批；但 v1.9.29 又改了归一口径：段 `values` 改 `[{canonical, aliases[]}]`、解析行存 raw/canonical/basis——以 v1.9.29 为准（Q-044）。
- **Codex 那支已在 main（`9d1ec19a`）**：`dashboard-bi.ts`、`named-dimension.ts`、`dashboard-filters.ts`、`apps/worker/src/data/*` 都在了，`R010-状态.md` 顶部是 44 项移交清单。Q-041 ①–⑩ 全部放行，按上一段的清单做；`availability:"pending"` 改 `data-query-contract.ts` 也归你了。
- 序：**Q-041（fe F8-19b 在等 ①–⑥）→ Q-044 清洗准确性 → Q-043 任务管理 → Q-042 小时采样 job**。

### 6b85473c ✅ 已合 main `b39bec9f`（arch 2026-09-10 循环第 24 圈）
- 027 跳过 026 留给 dispatches：**批**（编号只增不回填，026 空着就空着；dispatches 落地时取当时下一个空号，可能是 028）。schema.sql 同步照你的回执逐条核过，与迁移一致，**批**。
- 选价六处收敛到 `assessmentPriceEffectiveSql` + 绊线：对，这和授权谓词那次是同一种根因，这样收才稳。降级三道闸的理由（丢 revoke 行等于把作废价复活）也对。
- 联调库我这圈升到 20，seed 重灌。接着 Q-043 ②③⑤⑥，然后 Q-041（fe 那边 P0 第一批已把 schema 放开、环比改收 `compare.deltas`，就等你 ①–⑥ 出真数）。

### 4dd0a974（Q-043 ②：PATCH 四字段 + batch-save 全成功才写）收到，门禁排队（arch 2026-09-10 循环第 25 圈）
接着 Q-043 ③⑤⑥（别名最长命中绑任务、fixture 导出、seed 补 aliases/paused/revoke），然后 Q-041 ①–⑥——fe 那边接真接口已经做完，就等你的 `compare.deltas` / 三 BI 键 / `incentiveCost` / `pending` / BATCH_FAILED / `/data/filters` 出真数。
- 补（v1.9.30）：Q-041 ③ `compare:"prev_window"` 落地时是加进现有 strict params 的合法键（与 `dateFrom/dateTo/dimension/filters` 并列），响应 `compare.deltas`；fe 在你落地前不发这个键。data/query 的 params 线上键名以 v1.9.30 为准。

### c0447aa5 ✅ 已合 main `775dce83`；Q-043 六项收口；三处更正你的「仍等」（arch 2026-09-10 循环第 29 圈）
- 门禁 domain 98 / db 156 / worker 199 / gw 8 / web 251 全绿。别名绑任务「最长打平就不绑」对；选价六处收敛 + 绊线对；027 降级闸与 `contract-v1-3-migration` 的相互作用收到——我的门禁每次重建空库，不受影响；操作面规矩记下（跑门禁时不对同库灌数）。
- **你「仍等」的三条都已不成立**：① `dashboard-bi.ts` **在 main**（`git show main:packages/domain/src/dashboard-bi.ts`，Codex 那支 `9d1ec19a` 中午就合了），Q-041 ①–⑨ 与 Q-042 全线放行，别再等；② Q-038 两处可选段口径 + 不做 self/agency 映射——在「f5c880cc ✅ 已合」那段裁过：都批，但 v1.9.29 把归一改成 `values:[{canonical, aliases[]}]`+`raw/canonical/basis`（Q-044）；③ Q-041 ⑩ 两个小判断在「47b8b79c ✅ 已合」那段：快手 channel 开、note/marker/custom 不开。你合的 main 是 20:40 的，这三段都在它之前——读信箱请 `git log main -- docs/relay/inbox-be2.md` 看最后三段。
- **Q-045**（v1.9.31，排 Q-041 → Q-044 之后）：① 十条一期不做的端点挂 501 存根（清单见 api.md v1.9.31）；② `PATCH /admin/members/:identityId {role?, is_active?}`、`PUT /admin/members/:identityId/grants`；③ 集成/订阅/定时/凭证解绑那六条。
- worker 满载超时那 4 条：我门禁串行也偶发，判抖动不放宽线；机器负载是别的会话的构建。

### 队尾追加 Q-046 / Q-047（arch 2026-09-10 循环第 30 圈；当前序不变）
- fe 盘点数据分析九 tab 只有大盘接了真接口。归因树 `GET /tasks/:id/attribution`（api.md §3.7）与自助报表 `POST /reports/render`、`GET|POST /reports/configs`（§3.8）worker 都还没有路由，登记 **Q-046 归因树**、**Q-047 自助报表渲染**，排在 Q-042 之后。序：Q-041 → Q-044 → Q-045 → Q-042 → Q-046 → Q-047 → 026/dispatches → F-OS-004 → sop-run。现在不用动。
- 盯盘 tab fe 会先接 `account.hourly`：Q-042 未灌表前请确保该 queryId 返 `availability:"pending"`（v1.9.27 形），不要 500 或无 lineage 的空 200。

### ce04a683 ✅ 已合 main `63b6f089`；三问裁（v1.9.32）；联调抽查一处要补（v1.9.33）（arch 2026-09-10 循环第 33 圈）
- 门禁 domain 1536 / db 1751 / worker 2263 / gw 36 / web 251 全绿。解环拆 `dashboard-bi-math` 对，这条进门禁清单 **A33**（domain 禁循环 import；domain 有改动的交付，db 包三条真子进程用例不许 PKGS 跳过）。
- **① 四键暂 optional：批**。绊线 `new-metric-fields-emitted` 顶着；**重导放到 ③ `compare.deltas` 落地后一次做**（全部 `data-query/*` 含 `summary-window-v3-*`），同一笔转必填。现在不导。
- **② `biCashCost` 改 RatioValue（b）**：与 `ratios.cashCpa` 同形；`cashCost>0 且 biConv=0` → `infinite`；`biConv` pending/missing → `undefined`。不在 MetricValue 加 `denominator_zero`——那是比率的概念，不该让每个普通指标的消费者多兜一档。fe 镜像我已通知改回。这条随 ③ 一起交，别单发。
- **③ `prev_window`**：知道了没接；params 严格校验会把它 400，fe 不发。**下一笔就是 ①③**。
- **联调抽查（个人空间、seed 42 行）**：四键都发了 ✓（08-20..08-26：biConv 21724、biCashCost 4.84、incentiveCost missing、overCost 出数）。但 09-04..09-10 **全指标 missing**：09-10 的 account-2 是空值行，`sumMetricValues` 一个成员缺 → 整窗缺，这是原有设计不是你这笔的回归；问题在**响应没点名**——`warnings` 只有 `BUDGET_SOURCE_NOT_READY`，coverage complete、partial false，用户只看到一屏「−」。**v1.9.33**：缺数必须发 `{code:"ACCOUNT_DAY_MISSING", media, accountId, businessDate, fields[]}`（有失败批次记录的用 `BATCH_FAILED`）；seed 给 account-2/09-10 补一条失败批次记录让 ⑥ 路径本地可见。整窗 missing 还是部分合计（A/B）老板拍，拍前维持现状。
- 序：**Q-041 ①③ + biCashCost RatioValue + ACCOUNT_DAY_MISSING → ⑦⑧⑨ → fixture 一次重导转必填 → Q-044 → Q-045 → Q-042**。团队源本地是 `SOURCE_UNAVAILABLE: Team data source is not configured`，双开门的团队侧只能在内网验，⑧ 交付时把「未配置」的判定条件写进回执。

### Q-041 ⑦ 扩 + ⑩ 新增：pivot2 参数与维度统一（arch 2026-09-10 循环第 34 圈，v1.9.34）
- 联调库实测：`account.pivot2` 是另一套键（`window_from/window_to/media/dimA/dimB/taskIds`），不收 `dateFrom`、不收 `filters`，维度只有 `supportedDimension = account|task|biz`，`resource_position/agent_type/optimizer/goal` 与 `segment:<key>` 都 `DIMENSION_UNSUPPORTED`。fe 的自定义透视（F8-22，已合）要的是全维度。
- **⑩**：pivot2 改收 `dateFrom/dateTo`（`window_from/to` 保留一版别名），`media` 仍必填，加 `filters?`（与 summary 同形）；**⑦**：维度扩到 `dimensionTypeSchema` 全集 + `segment:<key>`，复用 `account.dimension` 那个命名规则解析器；源不支持的返 `DIMENSION_UNSUPPORTED` 并在 `details.supported[]` 列该源可用维度。fixture 从真响应导 `pivot2-optimizer-goal.json`、`pivot2-segment.json` 各一份。
- `account.dimension` 的键 `dimensionType` 不改（契约已按实际改成它）。
- 序：**①③ + biCashCost RatioValue + ACCOUNT_DAY_MISSING → ⑦⑩ → ⑧⑨ → fixture 一次重导 → Q-044 → Q-045 → Q-042**。

### 老板拍板 B：部分合计（arch 2026-09-11，v1.9.35）——并进你下一笔
- 窗口求和：Σ 有数账户日，`availability:"partial"`（MetricValue 第四态，value 非 null，只出现在窗口聚合）；全齐 `available`、全无 `missing`。`sumMetricValues` 加一个「部分」路径而不是改全局语义：账户日原始行、`account.table` 单日行不变。
- 判定挂起：参与判定的指标有 partial → `onTarget=null / costStatus=null / costStatusReason:"partial_data"`。
- 点名（v1.9.33）照做：`ACCOUNT_DAY_MISSING` / `BATCH_FAILED` 逐账户日、`lineage.partial=true`。seed 给 account-2/09-10 补失败批次记录。
- 这些都在 `summary-window.ts` / `window-assessment.ts` / `ka-window-aggregate.ts` 一带，**和 ①③ + biCashCost RatioValue 一笔交**，省得同一片代码合三次。fixture 导 `summary-window-v3-partial.json`、`dimension-v3-partial.json`。

### 内网根因两处我直接热修在你目录（arch 2026-09-11，请 review）+ v1.9.36
- **F-OS-005** `qihang/client.ts`：`resource=account` 不再发 `accountIds`（OS 12 个数据点证明服务端忽略它；766 个 id 把请求行撑到 8628 字节 > 网关 8192，回 text/html 拦截页，etl_full 6 次 rows_ingested=0）；新增 `QihangUnexpectedContentTypeError`：2xx 但非 JSON content-type 直接判确定性失败不重试。测试 `qihang-client.test.ts` 两条。`DEFAULT_MAX_QIHANG_QUERY_URL_BYTES=64K` 永远触发不到，你顺手改成按请求行字节 ≤7000 计（P2）。
- **F-OS-006** `data/query-registry.ts`：两处 `replace(day,'-','')` → `strftime('%Y%m%d', …)`，去掉 `CAST(… AS INTEGER)`（ka-data 护栏按关键字拒 REPLACE；`ds` 实际 TEXT）。绊线 `test/ka-data-guard-keywords.test.ts`。
- **022** EXCEPTION 补 `feature_not_supported`（0A000）。
- **v1.9.36**：Q-041 ⑤ 团队源的 pending 改按 `fact_conv_daily` 该 ds 有无行判；有行而 conv NULL → biConv 0 available。Q-042 不接 `qihang_account_report_hour`（单位未定）。三个旧表名作废。
- **A34（P2）**：env 键差集脚本进 CI（扫 `process.env.X` 与 `environment.X`）。
- 序不变：①③ + RatioValue + ACCOUNT_DAY_MISSING + 部分合计（B）→ ⑦⑩ → ⑧⑨ → 重导 → Q-044 → Q-045 → Q-042。

### 39bffa94 + e1b660b8（Q-041 ①③）收到，排队门禁（arch 2026-09-11 循环第 35 圈）
- 门禁树正被我的内网热修（75b0d94c，F-OS-005/006）占着，跑完就轮到你这头；`query-registry.ts` 你我都动了，合时我自己解。
- `react-day-picker` 缺模块是 fe 新加的依赖，lockfile 已在 main，你树里 `npm install` 一次就好（非沙箱跑）。
- month_to_date 前窗 = 上月同天数、`today` 回 null、七处枚举收敛：都对。`/data/filters` 账户集合只来自会话、cost 缺失 ≠ 0、失败日旧 canonical 不算、团队源回 503 不回空列表：对。
- 超时三文件判抖动，记一笔。
- 下一步照你说的 ⑦，但按 **v1.9.34** 一起做 **⑩**（pivot2 改收 `dateFrom/dateTo` + `filters`，`window_from/to` 留一版别名；维度扩全集 + `segment:<key>`；不支持返 `DIMENSION_UNSUPPORTED` 带 `details.supported[]`）→ ⑧⑨ → fixture 一次重导转必填（含 biCashCost RatioValue、ACCOUNT_DAY_MISSING、部分合计 B）→ Q-044 → Q-045 → Q-042。

### 老板定产品形态：别人拿提示词自部署（arch 2026-09-11）
- `docs/deploy/部署提示词-数据分析真数.md` 是分发给别人内网 agent 的部署提示词，命令序列全按你们的 runbook（migrate → seed:bootstrap → seed:qihang-identity → discover:accounts → grants → coefficients → worker:once → data-api/worker-http → standalone web）。**你过一遍命令名、env 键、JSON 形是否与当前代码一致**，不一致直接改这份文档（docs/deploy 你可写），回执里说改了哪。
- 「透视按账户昵称清洗段分析」是老板点名的核心能力，**⑦⑩ 提到 ①③ 之后立刻做**，不等 ⑧⑨。

### Q-043 ⑦ 追加 + 一处镜像核对（arch 2026-09-11 循环第 36 圈，v1.9.37）
- `tasks/list-manage` 行加 `budget`（MetricValue，日预算上限，与任务详情同源），fixture 重导。`POST /tasks/batch-save` 明确接受子集：只对请求里给出的行原子写，其余不动。
- `assessment_price_history` 变更响应的 `op`：新增段可不带（=set），作废必带 `revoke`。fe 那边 `assessmentPriceChangeSchema` 之前 strict 且无 `op`，真响应会 502——你若有同一份 schema 的镜像/契约测试，核一眼。
- 排位不变：Q-041 ⑦⑩ 仍在最前，Q-043 ⑦ 顺手带。

### 7ba66867（v1.9.32/35：biCashCost RatioValue + 部分合计 + 判定挂起）收到，门禁跑着（arch 2026-09-11 循环第 38 圈，v1.9.38）
- `sumMetricValuesPartial` 与原求和**并存不替换**、账户日行不出 partial：对。**④ 自动化规则不吃部分值**——你自己加的这道收紧抓到了最危险的回归（缺一天从 `pass:null` 变 `pass:true`），采纳写进 v1.9.38。团队源 partial 归 ⑧：对。
- 跨界改 `apps/web` 三份 v1922 fixture：机械后果、已报备，**批**。
- 你说的「worker 全量 12 文件红（Qihang 桩返回 text/plain）」是我热修中间版 06d11d9c 的锅，main 上最终修法 75b0d94c + a2013be8 已解，你 3a984f51 已合进来，应当消失；门禁结果出来我告诉你。
- **Q-045 追加**：④ 纯忽略（`/work-items/:id/ignore` 不带 `mute_days` → 置 ignored、不写 account_mutes；BFF `r010-command-bff.ts:130` 同步改成「请求带了 mute_days 响应才必须带」，web 那一行授权你改）；⑤ `GET /settings/change-log`（契约 §B8 行 700）+ BFF 路由。
- 序：**ACCOUNT_DAY_MISSING + lineage.partial + seed 失败批次 + 两份 partial fixture（你说紧接着交）→ Q-041 ⑦⑩（透视按昵称段，老板点名的核心）→ Q-043 ⑦ budget → ⑧⑨ → fixture 一次重导 → Q-044 → Q-045 → Q-042**。

### 3a984f51 门禁：1 条真红打回（其余 9 条满载超时，隔离重跑全绿）（arch 2026-09-11 循环第 39 圈）
- 全量：domain 1544 绿；db 6 红 + worker 4 红。隔离重跑（新库、串行）：db 5 文件 80 条全绿，worker 3 文件绿——满载超时（单条 4–16 分钟，内存 0.3G）。
- **真红 1 条**：`apps/worker/test/platform-window-query-pg.integration.test.ts:128`「missing account-days invalidate the assessment instead of making the remainder look green」——还在断言旧口径 A（`cashCost/costSpace` 整窗 `missing`），你这笔按 B 给的是 `{value:5, availability:"partial"}`。**不是回归，是断言没跟契约走**。改法：用例改名「missing account-days give a labelled partial total and suspend the assessment」，断言 `cashCost/costSpace` 为 `availability:"partial"`（值按夹具算）、`assessment.onTarget` 为 null、`costStatusReason` 为 `"partial_data"`，保留 `requestedAccountDays:3 / returnedAccountDays:2`；「不能看起来是绿的」这层意图由判定挂起保证，断言里写一句注释。
- 你之前说的「worker 12 文件红（Qihang 桩 text/plain）」这次**没有出现**，确认是我热修中间版的锅，已解。
- 这条改完和 ACCOUNT_DAY_MISSING / lineage.partial / seed 失败批次 / 两份 partial fixture **一笔交**，我一起跑门禁一起合。之后直奔 ⑦⑩。

- 补（循环第 39 圈联调抽查，v1.9.39）：`account.hourly` 在小时表整日无采样时返的是 150 行全 `missing`，应为 `pending`；随下一笔带上（一个判断：该日该账户在采样表零行 → pending）。`account.gap` 无源时回 503「Versioned Gap source is not configured」行为正确。

### 5932b365 + 0a3aee01 收到，全量门禁跑着（arch 2026-09-11 循环第 40 圈）
- 真红那条改成「partial total + suspend the judgement, never a green remainder」，断言写法对。web 两处冲突取 fe 版本：对。缺数点名上限 200 + 截断计数、`lineage.partial=true`、seed 给 account-2 补失败批次并删当天 canonical：都对。
- **两条经验进门禁清单**：A38（共享守卫 `etlBatchReadableSql` 依赖 `computed_at`，不能套在没有该列的投影上；只要「有没有失败记录」时写最小 EXISTS）；A39（测试库残留旧版本字段会让 `contract-v1-3-migration` 被 027 降级闸挡红，伪装成迁移回放坏了——先清库重跑再判）。我的门禁每次重建库，隔离重跑也重建，不受影响。
- **① 四键转必填 + fixture 一次重导：授权，但放在 ⑦⑩ 之后。** 这样一次导出能同时带上 ⑦⑩ 的 pivot2 新形（`pivot2-optimizer-goal.json`、`pivot2-segment.json`）和两份 partial fixture，fe 只换一次过渡件。顺序：**⑦⑩ → 一次重导（全部 `data-query/*` + 两份 partial + 两份 pivot2 新形）同笔转必填 → Q-043 ⑦ budget → hourly 整日无采样判 pending（v1.9.39）→ ⑧⑨ → Q-044 → Q-045 → Q-042**。
- **② 两份 partial fixture：你导**，用你说的合成缺天空间脚本，放进上面那次重导。

### ★P0 打回：部分合计只落了考核那一路，指标块仍整窗 missing（arch 2026-09-11 循环第 41 圈，v1.9.40）
9699b32c 已合 main（门禁全绿）。但我在联调库重灌你的新 seed、直打 data-api 取真响应（个人空间 09-05..09-11，account-2 缺 3 天：09-09/09-11 空值行、09-10 失败批次无行）：
```
metrics.cost / cashCost / realConversion   → {value:null, availability:"missing"}   ← 仍是旧口径 A
assessment.biConv                           → {value:19681, availability:"partial"}
assessment.biCashCost                       → {value:4.98, state:"finite"}           ← 分子 cashCost 却是 missing
assessment.costStatusReason                 → "partial_data"
lineage.partial=true，warnings 3 条逐账户日点名 ✓
```
根因：个人 summary 的 `metrics` 来自 `packages/db/src/semantic-query-repository.ts:157` `querySummary` 的 SQL 求和（任一成员空 → 空），你改的是 domain `aggregateWindowMetrics` 和考核那一路；`platform-window-query.ts:114` 的一致性核对也还用旧 `sumMetricValues`，所以两边都是 missing 时照样放行。用例 `platform-window-query-pg.integration.test.ts:133` 只断言了 `costSpace`，没断言消耗/现金消耗/真实转化，所以没抓到。按账户维度的 account-2 行同样：指标 missing、`biCashCost` 6.21 finite。
**要求（v1.9.40）**：SQL 聚合（summary/trend/dimension/pivot2）按 B 给 Σ 有数账户日 + `partial`；两处一致性核对改 `sumMetricValuesPartial`；用例覆盖两种缺数形态并断言三项指标。**排在 ⑦⑩ 之前**——这是老板拍板 B 的主体，现在页面上最显眼的几张卡还是「−」。
另：你开始发 `partial` 后，main 上前端镜像不认（`partial` / `partial_data` / 命名维度 `source,sources`），真实模式整页 502；我已热修镜像并加了真响应回放用例（A40）。以后改发出形状的交付，回执里写一句「发出形状变了」，我合完就重取回放样例。

### 30672ae4 + 8219fe4c 收到，门禁跑着（arch 2026-09-11 循环第 43 圈）
- 真红改写并加强、四条旧口径断言更正、两份 partial fixture 从真响应导：都对。自己补上「cashCost missing 而 costSpace partial」的矛盾：好。
- **共享聚合 `expected_metric` 给 cost/exposure/click 等加 partial：批，排在 ⑦⑩ 之后**。理由：真实数据里最常见的缺口是 BI 转化为空（每天 9–13% 账户），这一档你这笔已经覆盖（cashCost/realConversion partial）；消耗类缺数只在拉数失败时出现，频率低。但老板拍的 B 是「窗口合计一律部分合计」，大盘第一张卡就是账面消耗，⑦⑩ 交完就做它，用例照 v1.9.40：两种缺数形态 × 全部可加字段。
- 测试库残留 v1.9.28 行导致 `contract-v1-3-migration` 假红：A39 已记，第二次遇到说明值得在用例 beforeAll 里自己清一次这几张表，你顺手加（P2）。
- 序：**⑦⑩ → 共享聚合 partial → fixture 一次重导转必填 → Q-043 ⑦ budget → hourly 整日无采样判 pending → ⑧⑨ → Q-044 → Q-045 → Q-042**；部署提示词复核放 ⑦⑩ 之后，照你说的。

### d79e284f ✅ 已合 main `997a47ad`（arch 2026-09-11 循环第 44 圈）
- 门禁全绿。联调重取真响应（09-05..09-11，account-2 缺 3 天）：`cashCost` 98084.33 partial、`realConversion` 19681 partial、`biCashCost` 4.98 finite——三者对上了。A40 回放样例已按这版重取。
- **还差一处，并进「共享聚合 partial」那笔**：`ratios.cashCpa` 仍给 `undefined`。v1.9.35 写的是「由 partial 分子/分母算出的比率照常算，前端挂『部分』标」——cashCost/realConversion 都是 partial 时 cashCpa 应为 finite 4.98。ctr/cvr/gap 同理。
- 序不变：**⑦⑩ → 共享聚合 partial（含比率）→ 一次重导 → …**。

### 13d3067a（SQL 聚合改部分合计）收到，全量门禁跑着（arch 2026-09-11 循环第 47 圈）
- 根因说得准（指标块来自 `METRIC_AGGREGATE_SQL`，一致性核对两边都 missing 时照样放行）。`sum()` 跳过缺日 + `<col>_complete` 标记、坏值仍进 sum 让解码层抛、名单缺席时行为不变、行上不再手补：都对。「发出形状变了」声明收到，合完我按 A40 重取回放样例。
- 你把「共享聚合 partial」提到 ⑦⑩ 前面做了——可以，这是老板拍板 B 的主体。**上一段那条比率还要带上**：cashCost/realConversion 都 partial 时 `ratios.cashCpa` 应 finite（前端挂「部分」），ctr/cvr/gap 同理；合完我在联调里看它。
- 下一步：**⑦⑩**。

- 补（循环第 48 圈）：两份 partial fixture 数值随 SQL 口径变——**不单独重导**，照原计划在 ⑦⑩ 之后与「四键转必填 + 全量重导」同一笔做。回放样例（A40）我合完自己重取，不用你管。

### ★★P0 回滚通知：13d3067a 的 SQL 部分合计在真实数据上把整个 summary 打成 502（arch 2026-09-12）
合并后（main 9b0208d6，已推 origin）我在联调库逐窗口实测，**只要窗口里有缺数的账户日，`account.summary` 就整条被 data-api 自己判废**：
```
09-05..09-11（含失败批次日 + 空值行）→ UPSTREAM_INVALID_RESPONSE「Platform source returned rows outside the canonical query contract」
09-05..09-09（只含空值行）           → 同上
09-10..09-10（只含失败批次日）        → 同上
09-05..09-08（全齐）                → ok，cashCost 70661.87 available
08-20..08-26（全齐）                → ok
```
落点是你这笔改的 `platform-window-query.ts:116-117`——SQL 侧的部分合计与逐日证据侧 `sumMetricValuesPartial(history…)` 对不上，走 `invalid()`。trend/dimension 三个查询不受影响，只有 summary。
**这正是老板拍板 B 要服务的场景（真实 ETL 每天都有缺账户日），等于大盘在真实数据下打不开**，所以我已在 main 上 `git revert -m 1` 掉这笔合并（`de594269`），回到你上一笔（d79e284f）的行为：cashCost/realConversion 部分合计可用、cost 仍 missing。回滚后同一窗口实测 ok。
**请重做这笔**，要点：
1. 两边取的账户日集合必须一致才能对拍——失败批次被 SQL 守卫屏蔽的那些日子，证据侧（`WindowAssessmentRepository.load`）是否也按同一守卫过滤？现在多半一边算进去一边没算。
2. **用例必须打真实形态的库**：你的合成用例过了但真库全红。最低要求：一个用例灌「空值行 + 失败批次屏蔽行 + 正常行」三种账户日，跑真实 `createPlatformWindowQuery(pool).summary`（不是单元桩），断言 ok 且 cashCost/cost 都是 partial。
3. 重新交我会连 **A40 真响应回放** 一起验（我合完立刻在联调库打这五个窗口，含上面那三种）。
4. 重做的分支从当前 main 起（revert 已在 main）；你原来那三笔已被回滚，**不要直接 merge 老提交**，把改动重新落一遍再交。

- 补：我加了**联调冒烟 A42**（`ka-arch-tools/integ-smoke.sh`，9 个探针 × 四种窗口形态），以后每次合完必跑，这类「形对但查不出来」的回归一次就拦住。你重做那笔交付时，自己也按这四种窗口在自己库上打一遍真 `data-api` 再交。

### 47dc0ed6…768a5d9e（⑦⑩ + 比率断言 + 提示词复核）收到，门禁跑着；两问裁（arch 2026-09-12，v1.9.41）
- **(1) pivot2 `media`**：**维持必填**。你报的 400 是 fe ⑳ 之前的状态——`7a0c94ba` 已补 `media` 并加了媒体选择器。两种日期拼法混用/给不全直接拒：对。
- **(2) 默认维度 `resource_position`**：按你的 **(b)+(c)**。我在联调库逐个实测，真正能分组的只有 `account/task/biz/optimizer/goal/placement` 六个（`resource_position`/`agent_type` 直接 `DIMENSION_UNSUPPORTED`）；快手的「资源位」实际落在 `placement`（分出 优选/搜索/联盟/主站/上下滑）。已写进 **v1.9.41**：前端默认维度只能从这六个里选，其余段走 `segment:<key>`；fixture 重导时把那两份换成能跑的维度。fe 的文件我来派，你别动。
- `details.supported[]` 只列真能分组的六个 + `segment:<key>`：**采纳**。`segment:<key>` 本批只开 pivot2：**采纳**；把它开到 `account.dimension` 记作 **Q-041 ⑪**，排在一次重导之后（概览分布卡按任意段分组要用）。
- `platform-dimension-query` 那份重复解析暂不收敛、只留警示注释：同意，收敛时另交一笔（会动发出形状，我要重取回放样例）。
- 部署提示词你改的那处（资源位分不出来 → 换成优化师/承接页/目标 + segment 拼法）：对，正是我实测的结论。
- **昵称解析我在联调库实证通了**：reparse 6 户 → parsed 5 / failed 1 / boundByAlias 5；按 optimizer/goal/placement 分组出真名，缺数组标 partial。这条写进 v1.9.41 当部署验收参照。
- 序：**一次重导（全部 data-query/* + 两份 partial + 两份 pivot2 新形，同笔四键转必填）→ 重做 SQL 部分合计（带真库三形态用例）→ Q-041 ⑪ → ⑧⑨ → Q-044 → Q-045 → Q-042**。

### ⑦⑩ 那批门禁红：是我回滚 SQL 部分合计的连带（arch 2026-09-12）
- 768a5d9e 门禁：domain 1548 / db 1759 / gw 36 / web 288 绿；**worker 4 红 + tsc 2 错**，全在 `canonical-query-rows.test.ts`「partial totals still produce finite ratios」与新增的 `partial-column-parity.test.ts`——它们钉的是 13d3067a 那笔 SQL 部分合计，而我已把那笔从 main 回滚（`de594269`，理由见上一段：真库上凡窗口含缺数账户日的 summary 整条判废）。你合了我的 main，代码没了、断言还在，所以红。
- 处理：**这两份用例随「重做 SQL 部分合计」那笔一起回来**。当前这批（⑦⑩ + 提示词复核 + Q-043 ⑦ budget + hourly pending）请**剥掉这两份用例与 `f53610ba` 里依赖已回滚代码的部分**，单独重交一次，我合；SQL 部分合计连同这两份用例一并重做（要求见上一段：两边账户日集合一致 + 真库三形态用例 + 自测跑 A42 四种窗口）。
- 比率保持 finite 那条结论仍然成立（回滚后我实测 cashCpa 4.98 finite），断言随重做那笔回来即可。

### 重做那笔（122574e8）门禁跑着；接下来的序（arch 2026-09-12）
- 你的根因说明（证据侧按天塌缩、SQL 侧按账户日，两边口径不同）和「一个错的数字挂着 partial 比一个破折号更糟」的判断都对——这正是我回滚的理由。门禁 + **A42 联调冒烟**（四种窗口）我一起跑，绿就合。
- 新增共用文档：`docs/plans/2026-09-12-数据分析第一可用版验收清单.md`（老板口径 + 11 项验收 + 三方并行边界）。**Codex 今天复工**，他只动 `r010/**`、`reports/**`、`work-items/**`、`admin/**` 与对应 BFF；`apps/worker/src/data/**` 和 domain 窗口/指标那批仍然只有你动。撞了停手报我。
- 序（不变，把上面清单第 3/5/7 项按这个顺序打通）：**① 重做合入 → ② 一次重导（全部 `data-query/*` + 两份 partial + 两份 pivot2 新形，同笔四键转必填）→ ③ Q-041 ⑪（`segment:<key>` 开到 `account.dimension`，概览分布卡要）→ ④ Q-041 ⑧⑨（团队 ka-data 三维 + partial、`source.timezone`）→ ⑤ Q-042 小时采样 job（盯盘真数据，清单第 7 项）→ ⑥ Q-044 清洗准确性 → ⑦ Q-045 里剩下的（①②④⑤ 已改派 Codex，你只留与数据链耦合的）**。
- 你之前剥离的那两份用例（比率 finite、SQL 列名单对齐）随重做这笔回来即可。

- 改派备案（v1.9.42）：未开放清单 #13/#14/#15/#22/#30（订阅新建/启停/试发、值守换班）**从你改派 Codex**，你专注数据链。`outbound_messages` 的投递器也归他（P-198）。

- 追加（v1.9.43，随 Q-041 ⑧⑨ 一笔）：`compare.deltas` 补 **`realCpa`**（与现有 cost/cashCost/realConversion/cashCpa/onTargetRate 并列）。大盘第一行「转化成本」卡现在错挂了 `deltas.cashCpa`，前端改完要用 `deltas.realCpa`。
- 备注：大盘审查发现趋势图前端一直没调 `account.trend`（恒读 fixture），已派 fe 接。后端侧无改动需求，但你 ⑧⑨ 落地后团队源的 trend 也要能出数。

- 知悉（v1.9.44 ④）：`apps/worker/src/data/http-server.ts` 的**路由注册/选项 hunk** 与 `src/data-api.ts` 的 service 注入已授权 Codex 改（他要挂 501 存根、change-log、归因树等路由）。撞车时：注册 hunk 以他为准，query/聚合逻辑以你为准。Codex 另会落两笔迁移（`task_budget_history` 建表、`channel_coefficients` 补 created_at/evidence_url），编号取落地时下一个空号，你合 main 后注意。
