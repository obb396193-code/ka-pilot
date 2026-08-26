# ACCOUNTS-LIST-001 后端质量报告

> 代码 SHA：`3a7470f`，R1 修复 SHA：`1131f0d`
> 当前结论：`implemented + non_pg_verified + pg_blocked`
> 禁止表述为：已合流、已部署、已真实奇航联调、已通过真实 PG。

## 已通过

| 门禁 | 结果 |
|---|---|
| Domain 全量 | 40 files / 464 tests passed |
| Worker 非 PG 全量 | 67 files / 530 tests passed；2 个既有外部凭证 opt-in skipped |
| Worker 受 Docker 影响的全量尝试 | workspace sync PG 3 skipped；benchmark PG 1 timeout，明确失败不掩盖 |
| DB 纯逻辑 | 4 files / 20 tests passed；账户 Repository transaction/mapping 3 tests passed |
| 定向 HTTP/Service 回归 | 4 files / 60 tests passed |
| typecheck / lint | Domain、DB、Worker 全绿 |
| 生产依赖 audit | Domain、DB、Worker 均 0 vulnerabilities |
| R1 定向覆盖率 | Worker 98.89% statements / 89.65% branches；DB 95% statements / 69.23% branches |
| 边界扫描 | `git diff --check`、动态执行扫描、前端 0 diff、生产文件均少于 300 行 |

## 尚未通过

| 门禁 | 当前证据 | 必须动作 |
|---|---|---|
| 账户列表真实 PG | Docker API 完整权限下仍为 `EOF`，无法连接 55432 | Docker 恢复后运行 `packages/db/test/account-list-repository.test.ts` 7 项 |
| DB 全量真实 PG | 当前环境无法建立连接 | 账户定向通过后跑 DB 全量 tests/typecheck/lint |
| 真实奇航与内网部署 | 本批未执行 | root 合流、session/BFF/部署配置完成后另做只读 smoke |

## 已覆盖风险

- 同 workspace 跨 media 同 account_id、跨 workspace 同号和未授权账户不得进入 count/page；
- Repository 越界行整页 403 fail-closed，不静默删行；
- count/page/readiness 同一 RR/RO transaction；并发新增账户快照反例已写入真实 PG 测试；
- 缺 metrics/balance 不用 0 伪造；CPA 不由前端计算；
- `task_accounts` 是关联事实：任务主表缺行仍保留 taskId，并显式返回 taskName=null；
- DB present-invalid 数值（NaN/Infinity）按 502 `UPSTREAM_INVALID_RESPONSE`，连接/事务故障仍为 500；
- HTTP 与 Service 在 Repository 前统一要求 workspace-local user UUID；
- linkedTasks 由 Repository 按 JS canonical comparator 排序并拒绝重复，避免 DB locale 漂移；
- 非空指标若缺真实 computed_at，metricsComplete=false，页面只能 stale，不能冒充 ready；
- query 未知/重复/非法为 400，写方法 405，exact response limit 为 502 `SOURCE_TRUNCATED`；
- 响应和错误不回传 token、SQL、上游 body，requestId header/body 一致。
