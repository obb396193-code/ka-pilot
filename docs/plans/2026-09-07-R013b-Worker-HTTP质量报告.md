# R013b Worker HTTP 单轮触发质量报告

## 交付状态与精确范围

- 候选代码：`0532886`（终态 IPC/计数）、`f785004`（HTTP/PG 单飞/启动/操作节）、`a5770c9`（父进程提前断联防护）、`4639c0f`（仅一条真实 cleanup CLI 测试 30s）。
- 交审前已合 `main@7dfbaf9`，合并 SHA `b63449b`；相对该 main 自己的改动仅 Worker 与自己的计划/runbook §2.7，没有 Contract/前端视觉/DB 迁移改动。
- 最后交审前再合 `main@a1ff53a` → `a43b073`，只新增 arch 的内网请教清单；已核 `git diff b63449b..a43b073 -- apps/worker packages apps/dingtalk-gateway apps/web` 为空，以下最终定向对应的代码树没有变化。
- implemented candidate + targeted_pg_verified；**最终 SHA 尚未重跑全部套件，未合流、未部署、未 production-verified**。没有真实媒体写，没有 push，没有操作业务数据库。
- writing-plans 记录 TDD；code-quality-checker 检查安全、范围、性能、覆盖与依赖。无 executing-plans 技能，由主会话执行，未派子角色。

## 已实现 / 证据

| 冻结要求 | 实现与验证 |
|---|---|
| `POST /internal/worker/once` | 实际 `start:worker-http` Node 服务，非仅 mountable handler；独立真实启动测试，不配置 KA env 也能启动；启动/health 不入队 |
| 服务端 token / 禁客户端改 scope | 必填专用 token，SHA256 定长 timingSafeEqual；缺/错/重复 401；body 仅空或 {}，query/未知字段拒绝；header 自报 workspace 不传子进程；其他写路由 404 |
| 单飞 | 本进程 busy + PostgreSQL session advisory lock（workspace UUID 参数化）；两个 HTTP 实例同 workspace 第二个 409，不同 workspace 可独立拿锁 |
| 硬截止与恢复 | 父进程 SIGKILL 后等真实 close 才回 budget 并解锁；真实 PG lease 能重领，旧 fence 不能 markDone；无虚假 done/failed |
| 完成 / 授权阻断 / 计数 | strict IPC 区分 tick/consumer/terminal；零退出但无 terminal、重复 terminal、终态后消息、私有字段/非法计数拒绝；consumer 才累计 leased/done/终态 failed，旧 tick done 不重复计数，blocked_auth 独立返回 |
| 锁丢失 / 父进程消失 | PG error/end 都取消 owner；真实终止本测试专属 PG backend 后能取消/重拿锁。父 disconnect 在模块加载前的真实 PG 反例，修前新增一条 job，修后零条 |
| 真实权限链 | 实际 HTTP→fork child→DB membership/grants：空 grant blocked_auth；同库外 workspace job、changeset_execute 都保持 queued/attempts0；原授权 ETL 消费/cleanup CLI 真实 PG 回归 |
| 错误与日志 | 固定错误码/文本 + 安全 requestId；正常结果只三态与三个有限整数，不可能携带大 payload 超过16MB。请求到1KiB即拒绝；不输出 token/DSN/SQL/上游 body/qihang身份，子进程不继承触发 token/共享服务身份 |

计数含义明确为**本轮消费事件次数**，重试重领是新一次 leased，不伪装去重任务数。`completed` 仅说明本轮结束，不承诺所有已排队/延后重试 job 成功，更不自动将数据标 ready。

## 自审与中间失败

1. IPC RED 13 项中8失败：旧 string 返回/缺 terminal/blocked_auth 混成普通失败。实现后13通过。
2. HTTP 首次 RED 为模块未实现；后12项通过，补 requestId/取消后14通过。
3. 锁 RED：只监听 error 未监听 end，end 断联不取消。修后5项通过；真实 PG 断连补证通过。
4. Node 独立探针实证：IPC 断开后 `process.send` 仍是 function。生产 child 只检查 send 会在父进程已消失后入队。测试加载器初版 `.js`/实际 `.ts` 路径不一致，未进入 entry 导致 exit0；先纠正 harness，真正 RED 是 jobs 从0变1；加 `process.connected` 后零入队。cleanup entry 同步该前置守卫。
5. typecheck 发现 session cleanup 也复用 supervisor：显式接新 outcome 与 terminal，不加宽六类 ETL 白名单、不改变 cleanup 权限/30天留存逻辑。另修测试 mock 类型过窄，未关闭类型规则。
6. cleanup CLI 定向回归一次 5138ms 撞默认5s，非断言错误。`4639c0f` 仅该单例30s，不改全局 timeout/生产截止/断言；重跑2846ms通过。
7. SQL 全参数化；锁占一条连接，无长事务/N+1；锁 query/connect 限时5s；body 有界，响应 strict 且固定小对象；没有新依赖。正常客户端断开不抢先释放运行中的锁，避免重试启动重叠轮次。

## 门禁分层（不得混成最终全量通过）

### 完整回归：`f785004`，早于最后断联修复/新 main 合入

| 门禁 | 实际结果 |
|---|---|
| Domain | 58文件770/770 |
| DB（真实PG） | 70文件710/710，105.34s |
| Worker（含PG/HTTP） | 121文件通过+2外部opt-in文件跳过；1220过+2跳过，158.68s |
| Gateway（含PG） | 8文件36/36 |
| Web非视觉测试 | 143/143 |
| 四后端包 typecheck/lint | 通过 |
| Web typecheck/lint | typecheck失败：现有shiki/ai/use-stick-to-bottom等前端依赖缺失；lint 0error/17warning。未npm ci/改视觉隐藏问题 |

### 最终候选：`b63449b`（含 a5770c9 / 4639c0f / main@7dfbaf9）

- **46/46 定向通过**：worker-once-http-pg 6、worker-once-pg 3、session-cleanup-pg 5、supervisor13、HTTP14、lock5；Worker typecheck/lint通过。
- 37项覆盖运行（父断联补例之前，五个被测核心文件后续未改）：行/语句99.48%、分支89.76%、函数94.11%；HTTP/lock/process/protocol行100%，supervisor98.21%。child两个入口由真实PG实际进程覆盖，不虚报子进程覆盖率。
- Domain/DB/Worker production `npm audit --omit=dev --offline` 都0；这是缓存审计，非在线fresh漏洞证明。
- **最终全量门仍待 arch**：新 `后端双会话分工与防冲突.md` 要求 be/be2 全量前剩余≥8G；实测5.3GiB。该新规到达前第一轮全量已结束；之后仅定向，不重复压全量/清缓存。不能把旧 SHA 的1220当成最终全部通过。
- 日志在本 worktree `output/r013b-worker-http/`：domain/db/worker/gateway/web.log 是第一轮全量；final-focused.log 是合main后46项；web-types/web-lint.log为本机失败/警告。输出不入Git，固定合成库反复使用，不新建库。

命令：各包 `npm --prefix <package> test -- --run`；PG显式 `TEST_DATABASE_URL=postgres://ka:ka@127.0.0.1:55432/ka_be_r010_20260907_test PGCONNECT_TIMEOUT=3`，DB→Worker→Gateway串行。本轮仅使用合成账户/身份、synthetic.invalid来源，未使用真实凭证。

## 尚未完成 / 外部依赖

- 内测 sandbox 实际部署、autopilot cron 联通、反向代理长请求上限、PG启动和OSS备份/恢复演练未执行；f.yml仅收到OS结构说明，非完整可发布实测YAML。runbook仅新增本人§2.7，不改arch部署决策。
- Worker health是进程存活，不是数据新鲜度/源就绪证明；当前单轮仍 personal 显式 grants，不把共享服务身份当 fallback，team ingestion 属R011。
- R010a1剩余维度/pivot2/health/etl-runs，R010a2、R011(013)、R012(014)、R015(016)、R010b仍在本会话范围；**R014(015)/R016(017)按arch 550e738已正式移交be2**，不再重复实现。
- R-FE-IMG001/002按老板裁决关闭，候选保留output、不进仓、不再产正式尺寸。
- 回执后冻结分支等待arch ✅/❌；总目标没有完成，不冒称此 HTTP 子批覆盖全部信箱。
