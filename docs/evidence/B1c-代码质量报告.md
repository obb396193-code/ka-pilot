# B1c 代码质量检测报告

> 日期：2026-08-19
> 范围：`be/b1c` 相对 B1b `50e3014`
> 数据：仅本地 PostgreSQL 脱敏假数据

## 概览

- 新增生产 TypeScript：6 个文件，最大 213 行；
- 新增 PostgreSQL 测试：13 个；
- 全仓测试：101 个通过，0 失败；
- 问题：Critical 0 / High 0 / Medium 1 / Low 0；
- 质量门禁：通过，Medium 项不阻断本批仓储内核。

## 代码规范与复杂度

- 四包 `typecheck`、`eslint` 全通过；
- `git diff --check` 通过；
- 新增生产文件均小于 300 行；
- table、metrics、dimension、health 分模块，仓储类只负责组合；
- 所有返回类型显式定义，无 `any`、无动态执行。

## 安全

- 所有用户筛选值均用 PostgreSQL 参数占位符；
- 动态排序只来自固定字段/方向白名单；
- 动态维度 SQL 在运行时断言后映射为三套固定表达式；
- 每条业务查询第一层包含 `workspace_id`；
- 无硬编码 token、密钥、密码；无 `eval`、`new Function` 或子进程执行；
- 多任务重叠明确失败，禁止静默重复聚合。

## 测试与覆盖率

| 包 | tests | 行覆盖率 |
|---|---:|---:|
| domain | 12 | 93.39% |
| db | 36 | 89.71% |
| worker | 34 | 84.75% |
| dingtalk-gateway | 19 | 86.62% |

新增语义模块中：dimension 100%，health 96.80%，repository 100%；支持代码未覆盖分支主要是防御性异常路径。

## 依赖审计

- worker、dingtalk-gateway 在线 `npm audit`：0 vulnerabilities；
- domain、db 在线审计端点发生 TLS 中断，使用本机最新缓存执行 `npm audit --offline`：0 vulnerabilities；
- 四包安装过程也未报告漏洞。

## 性能审查

查询没有逐行 N+1：table 固定两次查询（总数+页面），health 固定四次并行查询，任务/业务维度固定两次查询（冲突检测+聚合）。

### Medium：生产数据量下需补查询计划与索引证据

当前事实表按日期分区，主键为 `(workspace_id, account_id, ds)`；部门级全 workspace 日期聚合是否需要 `(workspace_id, ds)` 等额外索引，必须用真实数量级 `EXPLAIN ANALYZE` 后决定。索引属于契约/迁移变更，本批不越权新增，交由 arch 在 API 冻结与内网压测阶段裁决。

## 已知产品边界

- 本批是内部仓储内核，不是已发布 API；
- `tier`、版位、出价工具、UBP、抵扣区间没有伪实现；
- summary 对比期 DTO、health 展示口径由 arch 冻结后在薄 API 层补；
- 多任务分摊规则缺失时返回明确冲突，不代替业务方选择归属。

