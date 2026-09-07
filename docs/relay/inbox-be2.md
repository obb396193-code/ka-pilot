

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
| T3 | 仓储 + 冲突计算（昵称 vs 平台字段 vs 奇航 task_id），`override` 永久优先、重解析跳过 `overridden` |
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
