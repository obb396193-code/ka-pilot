# Research / Knowledge 资料研究与知识资产 - 状态跟踪

> 角色：KA 投放经营平台“资料研究与知识资产 Agent”
> 分支：`codex/shared-source-library`
> worktree：`/private/tmp/codex-research-kb2`
> 本轮基线：`d540086`（承接 `P-KB-008`；原 worktree 被系统清理后重建，不含主工作区未提交改动）

## 修改边界

- 允许：`.gitignore`、`private/knowledge-sources/`、`docs/knowledge/`、本状态/设计/计划、知识目录校验脚本、`docs/relay/{README.md,inbox-arch.md}`、工作台账留痕。
- 禁止：冻结 PRD、Contract、前端、后端生产代码、Claude 当前脏工作区。
- 私有原文允许保留真实业务标识与金额；所有凭证值绝对禁止。

## 任务清单

- [x] 1. 正式任务定义与三层边界冻结
- [x] 2. 独立 worktree / `codex/` 分支建立
- [x] 3. 设计文档与实施计划按正式定义修订
- [x] 4. `.gitignore` 增加私有原文区
- [x] 5. catalog JSONL、Schema 与自动校验门
- [x] 6. README、录入模板、Agent 检索指南、产品发布映射
- [x] 7. `ka-src-0001` 白盒/黑盒原文私有留存
- [x] 8. `ka-src-0001` catalog 与 20 项独立评估
- [x] 9. hash、权限、生命周期、凭证和 Git 跟踪验证
- [x] 10. research/knowledge 角色注册提议
- [x] 11. `inbox-arch.md` 自包含审查事项
- [x] 12. 最终提交、自查并停止等待审查
- [x] 13. `ka-src-0002` 原文凭证扫描与私有留存
- [x] 14. `ka-src-0002` 全文核对、现有产品交叉审计与 20 项评估
- [x] 15. `ka-src-0002` catalog、校验、提交与 `P-KB-002` 交审
- [x] 16. `ka-src-0003/0004` 凭证扫描、敏感度分级与私有原文留存
- [x] 17. 两篇资料分别全文核对、产品映射与 20 项独立评估
- [x] 18. catalog、校验、功能提交与 `P-KB-003` 交审
- [x] 19. 新下载资料包/导读/Excel 的完整性、凭证与可用性审计
- [x] 20. `ka-src-0005/0006` canonical 私有留存、catalog 与 20 项独立评估
- [x] 21. bundle 校验门、功能提交与 `P-KB-004` 交审
- [x] 22. `ka-src-0005` 的 671 个子文件逐项导读、私有机器索引与覆盖报告
- [x] 23. 逐文档导读总览、检索说明、功能提交与 `P-KB-005` 交审
- [x] 24. 671 项产品相关性重评、借鉴边界和优先级标注
- [x] 25. 私有相关性清单同步、校验、提交与 `P-KB-006` 交审
- [x] 26. 快手磁力引擎开放平台公开入口、目录、版本与核心 MAPI 页面核验
- [x] 27. `ka-src-0007` 无凭证官方快照、catalog 与 20 项独立评估
- [x] 28. 校验、功能提交与 `P-KB-007` 交审
- [x] 29. 将 `ka-src-0007` 从 31 页首批证据扩展为当前 DSP/MAPI 完整目录与逐页快照
- [x] 30. 实读 `kuaishou-cli`，形成官方接口全集 × CLI 覆盖 × 产品用途差异矩阵
- [x] 31. 校验、功能提交与增量审查回执
- [x] 32. 独立审查 `ka-src-0007` 的公开目录完整性、CLI 匹配和夸大表述
- [x] 33. 建立巨量引擎 Marketing API 与官方投放知识资料资产
- [x] 34. 建立腾讯广告 Marketing API 与官方投放知识资料资产
- [x] 35. 补建快手磁力引擎投放术语、对象、规则与产品定义资产
- [x] 36. 统一完整性声明、产品相关性分类、校验、提交与交审
- [x] 37. 登记“审查批准后的资料必须上传产品知识库”后续要求
- [x] 38. 安全收录 `ka-data` 内部取数指南为 `ka-src-0010`
- [x] 39. 完成 `ka-src-0010` 证据分层、产品映射与 20 项独立评估
- [x] 40. 校验、功能提交并新增 `P-KB-011` 交审
- [x] 41. 按老板实证纠正 `ka-src-0010` 账户 ID 双命名空间假设，保留其他对象 ID 待核证并提交 `P-KB-012`
- [x] 42. 按 root R2 审计区分目标账户键与当前数据库 Contract，标记旧两字段指令 superseded 并加回归门
- [x] 43. 合流后按 R3 live schema 更新账户键现状，回归直接断言三张关键表主键

## 完成记录

- 2026-08-20：从用户正式任务定义确认，本资产不是私人笔记；仓库索引/评估是共享建设资产，产品知识库是批准后的发布目标。
- 2026-08-20：建立独立 worktree 和分支，未带入 Claude 工作区未提交文件。
- 2026-08-20：修正早期设计假设。内部原文允许完整保存到 Git 私有区；真实业务标识允许，凭证禁止。
- 2026-08-20：按先失败后实现完成 JSONL 解析、字段/枚举、生命周期发布门、hash、私有路径 Git 跟踪和凭证形态校验，9 项 Node 测试全绿。
- 2026-08-20：完成共享资料 README、20 项评估模板、Agent 检索指南和产品知识库字段映射；明确同 document_id/hash、ACL 继承与未审查禁发布。
- 2026-08-20：首篇原文保存到 ignored 私有区，hash=`560b8cc58f47264ec46e7515b74af30eee05de2dca5a3f3c25a6552996517073`；catalog 状态 `review_pending/E3/project_internal/not_ready`。
- 2026-08-20：完成 20 项独立评估与逐项产品映射。判断为“可控自治灰盒”；AI 实验编排建议先补证后选择性融合，不建议拆两套平台或无边界黑盒。
- 2026-08-20：10 项 Node 测试、仓库 validator、ignore 命中、私有区 Git 未跟踪检查全部通过。
- 2026-08-20：在 relay README 只追加 research/knowledge 角色注册提议，未改变现有角色边界；`inbox-arch.md` 新增 `P-KB-001` 自包含审查单。
- 2026-08-20：最终复核通过：10/10 测试、validator、双份私有原文 hash、ignore/未跟踪、`git diff --check`；功能 SHA=`f806a03`。
- 2026-08-20：`ka-src-0002` 凭证形态扫描为 0；原文同步到 worktree 私有区和正式私有区，双份 SHA-256 均为 `928c8f95d998fac66a8697c9fab55fc4dad3ab2798559cfd187587bcd67ca19f`。
- 2026-08-20：完成全文及 PRD/Contract/代码交叉审计。确认 `docs/18-KA日报规范借鉴.md` 是同源派生分析；大部分设计已吸收，但实际报告/知识库仍占位、数据页为 Mock，不能把设计写成已实现。
- 2026-08-20：完成 `ka-src-0002` catalog 与 20 项评估，登记 E3/`review_pending`/`not_ready`。新增无泄露凭证扫描明细函数；12/12 Node 测试、validator 和 `git diff --check` 通过。
- 2026-08-20：功能提交 SHA=`cb040a0`；`docs/relay/inbox-arch.md` 新增自包含审查事项 `P-KB-002`，未修改 `P-KB-001` 待审状态或其他角色边界。
- 2026-08-20：`ka-src-0003/0004` 凭证扫描均为 0；双份私有原文分别 hash=`96262502...fed5b`、`cc3214f1...18aab`，均命中 Git ignore。
- 2026-08-20：两篇按 `confidential` 登记，移除一般 development 访问；完成各自 20 项评估。媒体能力资料建议拆成能力目录/预检/映射候选；业务工作流资料建议拆成安全术语/规则候选/策略卡/实验草案。高风险回传与赔付做法明确禁止进入默认召回、规则和执行能力。
- 2026-08-20：13/13 Node 测试、catalog validator、评估敏感链接/长编号泄露检查和 `git diff --check` 通过。
- 2026-08-20：功能提交 SHA=`a52f91b`；`docs/relay/inbox-arch.md` 新增自包含审查事项 `P-KB-003`，合并交审但保持两篇资料/评估/结论独立。
- 2026-08-20：核验新下载的 `ka-platform-docs-v2.zip`、重复 `INDEX.md` 和《快手广告创建指令模板》Excel。资料包实际为 671 文件+58 目录，存在空/极小/重复/NUL 文件；原包含 signed URL 的 AK 标识与签名形状。Excel 无宏/外链/凭证，但含真实 ID、写操作参数和高风险字段，跨 Artifact Tool/LibreOffice 复现 8 个查找单元格 `#NAME?`，目标 Microsoft Excel 尚待补证。
- 2026-08-20：生成 `ka-src-0005` sanitized canonical：manifest + archive + 671 个可检索 extracted 文件；清除 128 处 access-key query、128 处 signature query、1 处 AK ID 形状和 3 处 named-secret assignment，清除后复扫 0。`ka-src-0006` 原 Excel 完整保存到 ignored 私有区；两篇均登记 E3/`confidential`/`review_pending`/`not_ready`。
- 2026-08-20：完成两篇独立评估。资料包建议“包级仅参考、子文档逐篇提升”，EVO 可补实验编排但不支持黑盒自动调控；Excel 仅借字段/交互，驳回直接复制执行、空字段生成、100 组默认、“其他默认”和高风险参数工具化。
- 2026-08-20：15/15 Node 测试、catalog/bundle validator、671 子文件/归档 hash、凭证复扫、ignore/未跟踪与 diff check 通过；功能提交 SHA=`c10094a`。`P-KB-004` 自包含登记两篇资产、sanitization、事实/推断/未证实、产品映射、发布禁止和 arch/security 裁决问题。
- 2026-08-20：逐项读取 `ka-src-0005` 的 671 个 sanitized 子文件，生成 private `derived/document-guide.md`、`document-inventory.jsonl` 和 `coverage-report.json`。每项包含稳定 child asset ID、标题/路径/抽取式介绍/主题/hash/质量与异常/治理状态；402 substantive、207 short、35 stub、27 empty，44 个文件属于 11 个重复组。
- 2026-08-20：确认 5 个 `.pdf` 是 UTF-8 文本而非 PDF 容器、3 个 `.json` 扩展名文件不是标准 JSON；均保留异常标记，不伪称完成版面或结构化解析。671/671 覆盖、确定性重建、凭证形态 0、私有双份 hash、15/15 知识目录测试和 validator 均通过。功能提交 SHA=`0dd641c`；`P-KB-005` 交审逐篇导读的治理与使用边界。
- 2026-08-20：按冻结产品定位/功能全景/验收基线重评 671 项价值，不继承 OS Agent 的下载判断。结果：8 direct、173 conditional、405 background、23 not relevant、62 cannot assess；663/671（98.8%）不是直接产品候选。直接候选仅是两种格式的投放摘要索引和 6 份 EVO 实验治理资料；条件候选主要为 97 份 AIStudio、74 份 O2/Aone、2 份 FBI 工程参考。一期不新增功能，全部结论待 arch 审查。
- 2026-08-20：相关性产物确定性重建与 671/671 字段/状态/分组校验通过，介绍和相关性字段凭证形态均为 0；4 份 private derived 产物已同步 canonical 且 hash 一致。功能提交 SHA=`77b89ed`；`P-KB-006` 自包含提交分类、借鉴边界、发布禁止和 arch 裁决问题。
- 2026-08-20：公开只读核验快手磁力引擎开放平台，确认 MAPI 授权/scope/token、账户资金、计划/组/创意、四层实时报表、素材审核和频控目录。聚合入口与 31 个 `documentId` 页面形成 `ka-src-0007` 无凭证快照；发现 `auto_build/auto_adjust/auto_manage` 媒体原生字段，以及 v2/gw 路径、计划上限 1000/500、广告主信息 POST/GET 等官方内部冲突。
- 2026-08-20：官方站内搜索“实验”返回未查询到接口；结论只限当前公开索引，没有据此断言白名单/内部能力不存在。评估建议 MAPI 先用于 Capability Registry、结构同步和执行回查，不替换一期启航主读取链路；媒体原生自动化进入后续研究，实验模式默认冻结。
- 2026-08-20：16/16 知识目录测试、catalog validator、凭证形态、双份 private hash、ignore/未跟踪和 diff check 通过；功能提交 SHA=`f8ffed6`。`P-KB-007` 自包含登记官方页面范围、事实/推断/未证实、产品映射、冲突、发布建议和 arch 裁决问题。
- 2026-08-20：老板纠正 MAPI 定位：启航继续承担一期既定数据主链路，但 MAPI 是快手官方媒体能力底座，`kuaishou-cli` 只是部分接口封装；缺失端点可按需新增 CLI 壳。已从官方前端还原公开文档 `menu/list` 与 `document/detail` 接口，当前 DSP 新版目录返回 15 个一级分组、385 个挂载页面、381 个唯一 `documentId`（356 个 API、29 个富文本），进入全量抓取与 CLI 差异审计。
- 2026-08-20：完成当前+旧版全量抓取：381+291=672 个唯一文档全部成功，另抓 29 个官方青雀富文本 HTML；提取当前 352、旧版 276 条 endpoint 记录。合规清除 374 处 header、322 处 token/secret assignment、4 处敏感参数示例值，保留字段名与说明；708 个归档条目由 manifest 逐文件 hash，archive hash=`5964328f...f604`。
- 2026-08-20：实读 `kuaishou-cli` 本机资产。zip 文件名 v1.0.2、代码版本 1.2.1；声明 25 个 MAPI endpoint，23 个存在命令调用链、2 个只定义未暴露，25/25 均与当前官方目录精确匹配。README 宣称 `raw`，但 `__main__.py` 未注册。当前官方 352 endpoint 中 327 未封装；这说明 CLI 是 MAPI 子集，可按需扩展，但不能把 documented 当 authorized/verified。
- 2026-08-20：生成 381 条机器能力矩阵并逐条标记 endpoint/版本/CLI 状态/读写风险/产品相关性/路线图/采用动作：59 一期候选、249 后续条件候选、73 参考或排除。明确排除代理商资金、共享钱包、CRM 外呼/企微成员、第三方支付和已下线能力；启航继续做一期数据主链路。
- 2026-08-20：23/23 测试、catalog/bundle validator、381 条矩阵基数、708 子文件 hash/凭证形态、双份 private diff、ignore/未跟踪和 diff check 通过；功能 SHA=`2faa8ea`。`P-KB-008` 自包含提交全量语料、CLI 静态审计、产品相关性、发布边界和 12 项 arch 裁决问题。
- 2026-08-20：老板要求对快手 MAPI 再做独立审查，并扩展至巨量引擎、腾讯广告官方接口与快手投放定义。已启动三个只读子 Agent：快手完整性反查、巨量官方资料发现、腾讯官方资料发现；子 Agent 不写共享文件，根 Agent 独立复核后才入库。完整性口径冻结为“指定抓取日期官网公开可发现范围内的最大覆盖”，不宣称覆盖白名单、登录后、私有或未索引文档。
- 2026-08-20：原 `/private/tmp/codex-shared-source-library.j1l066` worktree 被系统清理，已确认分支提交 `d540086/2faa8ea` 完整保留；重新挂载 `/private/tmp/codex-research-kb2` 继续本轮，未改动主工作区。
- 2026-08-21：快手独立复审确认 381/291 目录与 708 条 manifest/hash 完整，但发现 CLI 余额/流水 2 个 GET/POST 方法冲突、zip/PKG-INFO/代码三方版本冲突、旧版路径语义与 59/249/73 机器初筛过度表述；已修正矩阵为 23 command-path reachable / 21 method aligned / 2 conflict / runtime verified 0，catalog 时间和 superseded 首批快照指针同步更正。
- 2026-08-21：`ka-src-0008` 完成巨量引擎官网 `BUSINESS + LASTEST_UPDATES` 匿名快照：29 标签节点、2990 挂载、1103 唯一文档、1103/1103 详情成功、815 篇结构化 endpoint 文档、715 个结构化唯一路径；标签 29 导航节点记预期异常、失败 0。独立审查发现并修复原漏 3 篇近期文档、hidden 继承、leaf 命名和正文路径误升主接口。manifest SHA=`d6e3b759...bf82d`，archive SHA=`c488239c...c82f`。
- 2026-08-21：`ka-src-0009` 完成腾讯广告 Marketing API 公开 Apifox 镜像快照：315=8 指南+307 API，315/315 成功；297 个镜像原始唯一路径、298 个纠正后唯一路径；去重 320 个官方原站引用索引。独立审查确认镜像归属待补证、306 篇 Query/header 转换错位、1 个确定 endpoint 冲突；因此保持 E2/research 且禁止作 SDK/Contract 源。manifest SHA=`149a9865...cc67`，archive SHA=`69127e89...3a02`。
- 2026-08-21：新增快手官方投放导读、巨量/腾讯 20 项评估、多媒体产品相关性摘要、canonical private root 与三媒体检索纪律。实验编排结论：值得放 P2，但实验期间默认冻结未声明实时调控；仅预注册 guardrail 可中止，并标记数据截断/污染。
- 2026-08-24：老板明确“后面要把整理资料上传到知识库”。已将其登记为强制后续发布方向：全部资料进入发布候选队列，通过审查且状态达到 `approved/ready` 的版本必须由统一流程发布到产品知识库 Tab；未审查、被驳回、许可或权限不满足的资料不得绕过门禁。当前只更新发布规范和交审记录，不开发导入能力，不改变现有资料状态。
- 2026-08-24：收录内部《ka-data 取数指南》为 `ka-src-0010`。原文双份 private 留存，SHA-256=`7c7265c29cfa31d6bd4c22650f198a4405cb1f0e076c007297205bbe8bef43d2`，凭证形态扫描 0；因含内部服务/表/人员/业务样例，catalog 登记为 E3/confidential/`review_pending`/`not_ready`，不向 development 或产品 Agent 默认开放。
- 2026-08-24：完成与启航一期主链路、现有 API/metrics/schema Contract 的交叉审计。结论：ka-data 可能补 BI 转化、素材/商品、跨媒体和数据对平缺口，但当前只是资料主张；建议先做受控只读探针和同日同户对平，验证通过后才作为 ETL adapter 候选。普通用户/Agent 不开放任意 SQL，临时沙箱地址、reader token 机制、本地 SQLite 和硬编码系数不得直接进入生产设计。
- 2026-08-24：`ka-src-0010` 定向校验完成：18/18 Node 测试通过，10 条 catalog 结构有效，原文 hash 一致，原文/评估凭证形态 0，private 命中 ignore 且未被 Git 跟踪，`git diff --check` 通过。功能提交 SHA=`c50150f`；`P-KB-011` 已提交 arch/security/data owner 审查。
- 2026-08-24：R1 账户 ID 纠错完成：老板实证确认 KA 与平台 `account_id` 相同，联合键为 `(workspace_id, media, account_id)`，不建立账户 ID 映射表；`task/product/material/adgroup` 等其他对象继续 `unresolved`。已修正 0010 评估、检索说明、P-KB-011 口径并增加回归断言，功能 SHA=`eb10676`；18/18 测试、全库 validator、catalog 状态、双份原文 hash、凭证形态和 Git 私有区检查全通过；新增 `P-KB-012` 等待 arch 裁决，未发布知识库。
- 2026-08-24：R2 root 审计确认 R1 把目标键误写为当时 Contract 现状。已纠正 KA/平台 `account_id` 相同且不建账户映射表是老板已拍板事实，P-001#3 旧两字段指令标为 `SUPERSEDED/仅历史记录`，P-KB-012 不再要求 arch 接受已拍板事实；其他对象继续 `unresolved`，catalog 状态不变。
- 2026-08-25：R3 已将 `accounts/account_metrics_daily/account_balance` 主键及相关账户外键同步到 `(workspace_id, media, account_id)`，migration 005/006 与真实 PostgreSQL 跨媒体同号、孤儿反例通过。知识资产检索、评估、决策和 relay 已更新为当前现状；这不改变其他对象 ID 的 `unresolved` 状态，也不提升 catalog 审批/发布状态。

## 当前状态

`ka-src-0001~0010` 已完成入库评估；`ka-src-0010` 已完成 R2 纠错并在 R3 同步数据库现状，`P-KB-012` 保留后续复审席位。全部资料继续为 `review_pending/not_ready`，未自动升级为正式产品口径或知识库内容；`task/product/material/adgroup` 等其他对象 ID 仍待核证。
