# 内网标准部署路线（Pages + Aone App + BUC + Freestream 教程）与 KA Pilot 现路线对照（arch 2026-09-09）

> 老板转来的教程是内网「Web/管理后台」的标准复刻路线。**结论：登录（BUC/ACL）、HTTPS 域名（Freestream）、容器验收（StarAgent）、冷备（ODPS/钉钉云盘）四块可以直接照抄；前端托管和后端住法两块和我们不一样，其中「Aone 后端容器 + PVC」这条比我们现在赌的 FaaS 更适合我们，建议作为正式化主路线让 OS 评估。**

## 1. 逐段对照

| 教程环节 | 教程做法 | 我们现在 | 一样吗 | 对我们的意义 |
|---|---|---|---|---|
| 0 工具箱 | QoderWork Skill：a1 / code-platform / aone-change-release / buc-sso / normandy-cli / staragent / dws / maxc | OS 用沙箱 + autopilot 手工 | 不一样 | **OS 应装这套 Skill**，申请/验收都有现成命令，不用一条条翻网页 |
| 1 命名卡 | 先定 project-slug / 域名 / 端口 / 数据目录 / 容量 | 已有：应用名 `ka-pilot`、端口 web 3000 / data-api 3101 / worker 3102 | 一样 | 见 §3 命名卡，补 Code group、API 域名、PVC 目录 |
| 2 私有 Code 单仓 | Aone Code 私有仓 + 受保护主分支 + MR | 代码在 **GitHub 公开仓**（内网读不了私有仓所以公开） | 不一样 | 正式化的 CR/流水线/安全扫描都认 Aone Code → **要在 Aone Code 建镜像仓**，GitHub 仍是备份；OS 每次 pull GitHub 推 Aone（或反之） |
| 3 Aone Pages 前端 | 静态构建产物（Vite）上 Pages，`*.io.alibaba-inc.com` 默认域名 | **Next.js SSR + 34 条 BFF 路由**，必须有 Node 进程 | **不一样，不能直接照抄** | Pages 只托管静态；我们前端要么跟后端一起住容器/FaaS（现路线），要么改成静态导出 + BFF 挪后端（大改，不做） |
| 4 Aone 后端应用 + PVC | Aone 应用中心建应用，单 Pod + 端口 + PVC 挂数据目录，日常/正式两环境 | 内测 = 沙箱整套；正式化赌 **aone-platform FaaS**（无常驻进程、出网 443-only、5432 不通） | 不一样 | **Pod 路线正解决我们两大痛点**：worker 可以常驻循环；Pod 在 VPC 内连 RDS:5432 是常规做法。PVC 还能当内测期自建 PG 的盘（教程 SQLite 同理，单副本） |
| 5 可发布服务 | main.sh + APP-META/docker-config + /health + runtime.env 放 PVC 600 | 有 /healthz、ENV 由 OS 直灌、无 APP-META | 半一样 | 补 `APP-META/docker-config`、`main.sh`、`runtime.env.example`（Codex 小活） |
| 6 BUC + ACL | 日常/正式 AppCode；`/auth/login` 302 → BUC；`/sendBucSSOToken.do` 回调；服务端 `rpc/sso/communicate.json` 验票拿 empId；ACL 登录包管「能不能进」；应用成员表管角色 | provider=buc 只留了位置 | 目标一样，未做 | **接口细节齐了，契约 v1.9.7 已按它冻**；成员表 = 我们 v1.9.5 的 members；访客登录（v1.9.6）是 BUC 之外的补充 |
| 7 Freestream HTTPS API 域名 | `<project-api>.alibaba-inc.com`，办公网，强制 HTTPS，回源端口，/health | aone-platform 自带 `ka-pilot.fn.taobao.net`；沙箱是 `*.agent.alibaba-inc.com` 临时地址 | 不一样 | 走 Pod 路线就要申请 Freestream 域名；浏览器只打 web（BFF），data-api 内网不需要域名 |
| 8 发布链 | 前端 Pages 流水线；后端 CR → 评审 → 安全扫描 → 日常 → 正式 | OS 手工 | 目标一样 | 正式化必经；对接人 A15 |
| 9 StarAgent 远程验收 | exec/上传/查进程端口挂载 | OS 手工 ssh | 一样 | 验收脚本可照抄（/health、进程、PVC、runtime.env 权限） |
| 10 数据与备份 | 在线 = PVC；冷备 = ODPS（maxc）；交接 = 钉钉云盘（dws） | 在线 = 沙箱 PG；备份 = 本地 pg_dump（OSS 卡云账号） | 半一样 | **备份改走 ODPS 或钉钉云盘**，绕开 OSS 云账号死结（A12） |
| 12 误区 | Pod Ready ≠ 成功；BUC 成功 ≠ 成员；密钥不进仓 | 已有同样规矩 | 一样 | — |

## 2. 采纳什么、不采纳什么
- **采纳**：BUC/ACL 接入方式（契约 v1.9.7）；Aone Code 镜像仓；**正式化主路线改评估「Aone App（Pod）+ RDS」**，FaaS 降为备选；Freestream 域名；StarAgent 验收脚本；ODPS/钉钉云盘冷备；APP-META/main.sh/runtime.env 规范。
- **不采纳**：Aone Pages 托管前端（我们是 SSR）；SQLite（我们 PG）；单副本 worker 改多副本前先换共享队列（我们已是 PG 队列，不受限）。
- **顺序不变**：内测继续沙箱方案 A；正式化按 §4 申请清单推进。

## 3. 命名与容量卡（复制教程模板，按我们填；空的老板/OS 填）
| 变量 | 值 |
|---|---|
| 项目短名 | `ka-pilot` |
| Code group | `<老板/OS 填：团队 Aone Code group>` |
| Aone Code 仓 | `<group>/ka-pilot`（GitHub `obb396193-code/ka-pilot` 的镜像） |
| 应用 | `ka-pilot-web`（Next SSR + BFF，端口 3000）、`ka-pilot-api`（data-api 3101 + worker 循环 3102）；或一个应用两进程（OS 定） |
| 入口域名 | `ka-pilot.alibaba-inc.com`（Freestream，办公网，强制 HTTPS，回源 3000，健康 `/login` 或 `/api/internal/healthz`） |
| 数据库 | 内网 RDS PG16（CloudCenter，A13）；申请期间可用 Pod PVC 自建 PG16 单副本顶内测 |
| 数据目录/PVC | `/home/admin/ka-pilot/logs/data`（备份、runtime.env、fonts 缓存） |
| 密钥 | `runtime.env`（600）：DATABASE_URL、DATA_API_INTERNAL_TOKEN、AUTH 会话密钥、BUC_APP_CODE、允许 Origin |
| 容量 | 内测 ≤ 20 人、QPS < 10、单副本 |

## 4. 要去申请的清单（找运营/OS；带上 §3 的值）
| # | 申请 | 入口 | 谁 | 门禁 |
|---|---|---|---|---|
| 1 | Aone Code group + 私有仓 `ka-pilot`（镜像 GitHub） | Aone Code | OS（`a1 repo create`） | A27 |
| 2 | Aone 应用 `ka-pilot-web` / `ka-pilot-api`：产品线、Git group、owner、日常/正式环境、Pod 配额、PVC | Aone 应用中心 + Normandy | 老板确认产品线/owner，OS 执行 | A14（改为 Pod 路线评估） |
| 3 | 内网 RDS PG16 | CloudCenter | 老板工单 | A13 |
| 4 | BUC 日常 AppCode（login-test）+ 正式 AppCode + 回调域名白名单 | 日常 BUC / 正式 BUC 申请页 | OS 申请，老板 owner | A24 |
| 5 | ACL 登录权限用户组「ka-pilot 基础登录包」+ 成员 | ACL 权限平台 | OS 建组，老板给名单 | A28 |
| 6 | Freestream HTTPS 域名 `ka-pilot.alibaba-inc.com`（办公网、根路径、回源 3000、/健康、QPS） | Freestream 接入管理 | OS | A29 |
| 7 | ODPS 冷备表（或钉钉云盘交接目录） | ODPS 权限流程 / dws | OS | A30 |
| 8 | 正式化对接人（CR 评审 + 发布审批） | — | 老板物色 | A15 |

## 5. 给 OS 的话（已并入合并消息 §8）
装教程里那套 Skill；评估「Aone App Pod + PVC + Freestream」替代 FaaS 的可行性（关键：Pod 能否连 RDS:5432、能否常驻 worker）；按 §4 顺序发起申请，每项回：入口、需要老板填什么、预计时长。
