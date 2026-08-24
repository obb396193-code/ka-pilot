# R2 requestId 与契约 fixtures 质量报告

> 日期：2026-08-24
>
> 分支：`codex/dual-data-backend`
>
> 代码提交：`a81a176`
>
> 状态：implemented / Codex self-checked / Claude review pending

## 实现结论

1. Next BFF 传入的 `x-request-id` 已贯穿 HTTP server、mountable handler 与
   `DataQueryService`。所有 HTTP 响应均返回 `x-request-id` header；错误 envelope
   中的 `error.requestId` 与 header 一致。
2. 相关 ID 只接受 1–128 位日志安全 ASCII：
   `[A-Za-z0-9][A-Za-z0-9._:-]*`。缺失、超长、Unicode、斜杠、前导空格、CR/LF
   均安全重新生成，非法原值不进响应或日志。无效 fallback generator
   直接 fail closed。
3. 未改动冻结的 `{ok,data:{mode,...}}` 成功 envelope；成功请求的相关 ID
   仅从 HTTP header 取得。
4. `packages/contract/fixtures/data-query/` 新增四个自包含 canonical 响应：
   ready lineage、unknown/null lineage、reconcile engine pending 和 stable error。
   Domain test 直接从 Contract 目录读取并用 `dataQueryResponseSchema` 验证，供
   前端 parity test 复用。
5. Contract 已明确 BFF 必须传 `Authorization`、`x-request-id`、
   `x-ka-workspace-id`、`x-ka-user-id`、`x-ka-account-scope`。scope 只能来自
   服务端登录/授权上下文；本机 dev 只允许假数据 fixture，production fail closed。
6. 未降低既有 scope guard、Query Registry/raw SQL、2k/10k/16MB 截断、
   凭证保护。Runtime/Multica/ChangeSet 真实写操作仍关闭。

## 测试与门禁

- TDD RED：Worker 首轮 5 个失败点（缺 request-id module、HTTP header 未回传、
  service 忽略相关 ID）；Domain 8 个 fixture ENOENT，均在实现后转绿。
- Domain：33 files / 414 passed。
- DB：19 files / 94 passed；PostgreSQL 16 真实 migration/repository 测试通过。
- Worker：59 files / 404 passed；2 个既有 opt-in 外部通路测试 skipped。
- DingTalk Gateway：5 files / 19 passed。
- 四包 typecheck、lint、`npm audit --audit-level=high` 通过，0 vulnerabilities。
- Worker 全量覆盖率：statements 92.23%、branches 81.01%、functions 95.97%。
- `src/data`：90.89% / 80.56% / 95.12%；`request-id.ts` 三项 100%；
  `http-server.ts` statements 90.95%、branches 84.21%、functions 100%。
- `git diff --check`通过。凭证/动态执行/危险 SQL 扫描未发现生产问题；
  命中项均为既有的泄漏防护反例假密钥。

## 环境事件

首次全量门禁被 Docker Desktop `no space left on device` 阻断。按老板先前批准的
“只清可再生缓存”原则，清理 npm、uv、HyperFrames、Chrome DevTools MCP、
Puppeteer 和 Playwright 缓存；未删除项目文件、`node_modules`、`.venv` 或 Docker
数据卷。强制终止卡死的旧 `com.docker.backend` 进程后，空间实际回收，
Docker Engine 与 PostgreSQL 健康恢复，全量门禁完成。

## 已知未完成

- Next BFF/前端尚未对这些 fixture 运行 parity test；由集成/前端分支完成。
- 正式登录/权限系统如何生成 account scope 仍需集成；后端不提供 dev fallback。
- 尚未使用真实 KA Data token/账户完成内网 E2E，未部署 daily/FaaS。
- reconcile 计算内核仍 pending，不输出伪 delta。
- R3/P0 已登记：账户三键、media-account tuple scope、canonical rows、数据库联合键、
  只读 work-item/change-set 详情。不混入本 R2 提交。
- Claude/arch 尚未复审；本报告不宣称已批准、已合并、已部署或已上线。
