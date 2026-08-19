# 代码质量检测报告：UI 资产全量审计

> 检测日期：2026-08-19
> 范围：`apps/web/scripts/ui-catalog/`、`docs/frontend/ui-assets/`、`apps/web/AGENTS.md`；不包含正在进行的 F-001 页面文件。

## 概览

- Critical：0
- High：0
- Medium：2（可维护性/离线体积债务，不阻断）
- Low：0

## 已执行门禁

| 类型 | 结果 | 证据 |
|---|---|---|
| 代码规范 | 通过 | ESLint 对 `scripts/ui-catalog/*.mjs` 0 error；`git diff --check` 通过 |
| 安全扫描 | 通过 | 变更范围未发现硬编码 key/password/private key、`eval`、`new Function`、child process 执行；付费 token 只保存变量名/许可规则，不保存秘密 |
| 依赖安全 | 不适用 | 未修改 `package.json`/lockfile，未安装任何第三方 UI runtime 或新依赖 |
| 单元/集成测试 | 通过 | Node test 49/49；覆盖 schema/access/cache、12 库固定总量、上下游条目增减漂移、runtime provenance、付费语义负例、离线 HTML 完整性与 CSS 注入 |
| 数据一致性 | 通过 | catalog 12/12＝5,996；capability index 5,996；JSON 全部可解析；coverage/runtime stale check 通过 |
| 官方连通 | 通过 | 当前 health 为 11 verified/1 partial/0 blocked；全量匿名 sync 曾因 GitHub API 限额出现 3 个 403，已用登录的只读 GitHub API 确认对应公开树 `truncated=false`，不是会员墙；ReUI 终验端点再次返回 200 并刷新到 2,315 |
| 性能/上游负载 | 已处理 | ReUI 30 个 icon 分类页改为每批 6 个请求，避免一次并发 30 个请求 |
| 缓存/许可 | 通过 | 89/89 缓存条目反查均为 public-source，93 个物理文件 hash 全通过；paid cache 0 |
| 浏览器 | 通过 | 1440×900、1024×500、390×844 实测；初始化/筛选/分页 console 0 error/0 warning，外部运行时请求 0，横向溢出 0 |
| 生成物新鲜度 | 通过 | Agent 入口、capability、coverage、runtime、cache、alternatives、showroom 全部 `--check`；同步器已把 count 只防下降改为任意 count drift 都阻断，正是该门禁抓到 ReUI 2,255→2,315；`git diff --check` 通过 |

## Medium：同步器文件较大

`sync.mjs` 当前约 1,250 行，原因是 12 个上游的格式完全不同：Registry、Git tree、HTML、sitemap、动态页面和 TypeScript preset。功能已有按 parser 函数隔离和测试，但继续加入第 13 个来源前，应按 source 拆成 `parsers/<source>.mjs`，保留统一 normalize/validate/write pipeline。

当前不拆分的理由：本轮重点是修复访问/许可证语义和全量缺口；立即机械拆文件会增加回归面，且 48 个测试与 fixture 已能守住核心行为。此项不阻断提交。

## Medium：离线展厅体积

`showroom.html` 约 9.92 MB，`showroom-data.json` 约 13.02 MB，合计约 22.94 MB。根因是 HTML 内嵌 5,996 个资产和 2,153 组付费处置数据，同时保留可再生成 JSON。本机冷加载 DCL 约 1.2s，不影响当前本地展厅；若后续做线上或低端移动发布，应将重复 candidate 字典化、mapping 只存 ID，或改分片加载。

## 复核结论

质量门禁允许提交。三路只读 subagent 已按 ReUI 新增后的最终哈希重新签字，无 P0/P1；主 Agent 的 49/49 全量测试、ESLint、生成物门禁和浏览器复核也独立通过。没有把会员 401 当网络 bug，没有把公开仓库误当已运行时安装，也没有修改 F-001 运行时页面；主 Agent 还在独立审查后追加发现并修复 1024px 筛选栏溢出。剩余风险均已显式进入 audit，而非隐藏在 `complete` 一词后。
