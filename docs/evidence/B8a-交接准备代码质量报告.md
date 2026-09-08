# B8a 交接准备代码质量报告

> 日期：2026-08-20
>
> 分支：`be/b8a`
>
> 代码审查基线：`9fce24a`
>
> 性质：合并前本地质量证据；不代表真实内网通路、部署或业务验收完成

## 1. 本批代码范围

| 提交 | 结果 |
|---|---|
| `6c1d65b` | Qihang 响应体、结果行、ID 数和 URL 字节资源预算；ETL/Backfill payload 同步上限 |
| `9fce24a` | Qihang→Canonical 纯合成 benchmark runner、CLI、合约测试与本机证据 |

交接/联调文档不改变公开 API、数据库 Schema 或外部协议。Claude 前端 `fe/f001` 工作树未被修改。

## 2. 全量门禁

| 门禁 | 结果 |
|---|---|
| 默认测试 | Domain 193 + DB 74 + Worker 148 + DingTalk Gateway 19 = **434 passed**；Worker 真 SDK 测试按设计默认 1 skipped |
| 真 SDK opt-in | `KA_RUN_AGENT_SDK_SMOKE=1`：**1 passed**；真实 Claude Agent SDK 子进程 → localhost gateway → fake OpenAI-compatible upstream；同时覆盖流式与 timeout abort |
| TypeScript | 四包 `tsc --noEmit` 全绿 |
| ESLint | 四包全量 lint 全绿 |
| PostgreSQL | `postgres:16-alpine` 本地隔离库；DB 74 tests 通过，migration test 含 up/down/up 回放，Job lease fencing 反例继续通过 |
| 依赖漏洞 | 四包 `npm audit --omit=dev --audit-level=moderate` 均为 **0 vulnerabilities** |
| Diff | `git diff --check` 通过 |
| 复杂度 | 本批变更生产代码 complexity≤10、单函数≤100 行，0 发现 |
| 静态安全扫描 | 本批代码常见 `mul_`/`mcn_`/长 Bearer/sk 凭证模式无命中；Qihang/benchmark 生产代码无 eval/new Function/child_process/exec/spawn/shell=true |

受限沙箱首次执行 DB 和 Worker localhost e2e 时分别出现 `connect/listen EPERM`；这是环境禁止 localhost，不是断言失败。授予仅本机测试访问后，两包原命令均完整通过；报告采用复跑结果，不把受限环境失败隐藏成业务 bug。

## 3. 覆盖率

| 包 | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Domain | 95.43% | 85.13% | 99.10% | 95.43% |
| DB | 93.62% | 77.65% | 97.32% | 93.62% |
| Worker | 91.22% | 77.11% | 94.33% | 91.22% |
| DingTalk Gateway | 86.62% | 75.92% | 94.11% | 86.62% |

本批关键模块：Qihang 94.84%、benchmark 97.95%。覆盖率只表示被本地测试执行，不代表真实上游兼容。

## 4. 新增安全与可靠性证据

1. 声明 `Content-Length` 超限时，在访问 response body 前失败。
2. 无长度流式 body 累计字节超限时取消 reader 并失败。
3. rows、accountIds/adIds、编码 URL 超限均在扩大资源消耗前失败。
4. `QihangResourceLimitError` 不重试，避免重复放大上游压力。
5. 限制配置为 0、负数、非整数或 NaN 时构造失败。
6. benchmark 用假 workspace/account/user、本地 Response 和计数端口；不读网络、数据库或真实业务数据。
7. benchmark 测试不按本机毫秒数设门禁，只断言规模、字节、调用次数和输出结构。

## 5. 性能结论边界

- 当前 5,000 条瘦合成数据约 1.01 MB，可通过 10 MiB 默认响应上限；真实响应更宽时可能先触发字节上限。
- Canonical 每条 input 调用 settings、history、upsert，整轮为 `3N+4` 端口调用。真实 SQL RTT、连接池、锁和 WAL 尚未测，因此批量预取/写入继续是 P1。
- 单查询 ID 默认上限 1,000。大账户没有完成正式分片、进度、重试和部分失败语义，不对外宣称支持。

## 6. 尚未验证

- 真实启航字段、限流、最大 URL/响应和应用身份；
- Multica/OS 正式 read/preview/execute 请求、回执和原始 run 引用；
- Secret 服务的 SDK、TTL、revoke 和审计；
- 真实 IdeaLab/Anthropic/其他 Provider 能力与许可；
- 本项目钉钉 Stream、FaaS daily、共享 PG 网络、24h 稳定性和恢复演练；
- `be/b8a` 与 `fe/f001` 的实际 integration merge 和 E2E。

以上必须按 `docs/plans/2026-08-20-真实通路联调准备清单.md` 产生真实、脱敏证据后才能改状态。
