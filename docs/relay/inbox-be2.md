

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
