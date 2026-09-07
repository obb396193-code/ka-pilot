

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
