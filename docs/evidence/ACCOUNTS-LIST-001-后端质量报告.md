# ACCOUNTS-LIST-001 后端质量报告

> 代码 SHA：`3a7470f`  
> 当前结论：`implemented + non_pg_verified + pg_blocked`  
> 禁止表述为：已合流、已部署、已真实奇航联调、已通过真实 PG。

## 已通过

| 门禁 | 结果 |
|---|---|
| Domain 全量 | 40 files / 464 tests passed |
| Worker 非 PG 全量 | 67 files / 528 tests passed；2 个既有外部凭证 opt-in skipped |
| Worker 受 Docker 影响的全量尝试 | workspace sync PG 3 skipped；benchmark PG 1 timeout，明确失败不掩盖 |
| DB 纯逻辑 | 4 files / 19 tests passed；账户 Repository transaction/mapping 2 tests passed |
| 定向 HTTP/Service 回归 | 4 files / 58 tests passed |
| typecheck / lint | Domain、DB、Worker 全绿 |
| 生产依赖 audit | Domain、DB、Worker 均 0 vulnerabilities |
| 新文件覆盖率 | Domain 100%；Worker 98.44% statements / 89.43% branches；DB 97.45% statements / 65.11% branches |
| 边界扫描 | `git diff --check`、动态执行扫描、前端 0 diff、生产文件均少于 300 行 |

## 尚未通过

| 门禁 | 当前证据 | 必须动作 |
|---|---|---|
| 账户列表真实 PG | migration hook 10s timeout；Docker API 完整权限下 `EOF`；55432 no response | Docker 恢复后运行 `packages/db/test/account-list-repository.test.ts` 6 项 |
| DB 全量真实 PG | 当前环境无法建立连接 | 账户定向通过后跑 DB 全量 tests/typecheck/lint |
| 真实奇航与内网部署 | 本批未执行 | root 合流、session/BFF/部署配置完成后另做只读 smoke |

## 已覆盖风险

- 同 workspace 跨 media 同 account_id、跨 workspace 同号和未授权账户不得进入 count/page；
- Repository 越界行整页 403 fail-closed，不静默删行；
- count/page/readiness 同一 RR/RO transaction；并发新增账户快照反例已写入真实 PG 测试；
- 缺 metrics/balance 不用 0 伪造；CPA 不由前端计算；
- query 未知/重复/非法为 400，写方法 405，exact response limit 为 502 `SOURCE_TRUNCATED`；
- 响应和错误不回传 token、SQL、上游 body，requestId header/body 一致。
