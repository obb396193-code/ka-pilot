# B8a 知识库领域底座实施计划

> 日期：2026-08-20
>
> 分支：`be/b8a`
>
> 基线设计：`docs/plans/2026-08-20-B8知识库领域底座-design.md`
>
> 约束：测试先行；只改 Domain 与本批文档，不改 contract、migration、API、worker 或前端。

## 目标

把 ContentRadar 已验证的 blocks 文档真相、文本投影和 ID 双链语义，扩展为适用于 KA 报告、案例、SOP 与 Agent 引用的纯 TypeScript 领域内核。后续公开契约、数据库和前端只需要适配这些语义，不需要重写规则。

## Task 1：正文信封、资源上限、文本投影与稳定指纹

文件：

- 新增 `packages/domain/test/knowledge-document.test.ts`
- 新增 `packages/domain/src/knowledge-document.ts`
- 修改 `packages/domain/src/index.ts`

步骤：

1. 先写失败测试：合法 `{blocks}`、裸数组、顶层未知字段、非 JSON 值、循环引用、危险 key、过深/过大/过多节点。
2. 写投影测试：递归正文 `text`、`wikilink.props.title`、顺序、空白和 ID 噪音。
3. 写指纹测试：对象 key 顺序不影响指纹，数组和内容变化会影响指纹。
4. 实现受限 JSON 深拷贝、冻结、投影和带版本前缀的 SHA-256 指纹。
5. 跑定向 test/type/lint 后提交。

## Task 2：文档双链、业务对象引用与替换计划

文件：

- 新增 `packages/domain/test/knowledge-references.test.ts`
- 新增 `packages/domain/src/knowledge-references.ts`
- 修改 `packages/domain/src/index.ts`

步骤：

1. 先写 wikilink 提取测试：UUID、路径、首出现去重、坏节点诊断。
2. 写替换计划测试：自链、坏 ID、可用目标、不可用目标；不可用原因不区分跨 workspace 与不存在。
3. 写 `business_ref` 测试：首批对象类型、受限 opaque ID、显示缓存、快照和数据截止时间、去重与坏节点诊断。
4. 实现只暴露安全摘要的结构化诊断，不把原始非法 payload 放进日志/响应。
5. 跑定向 test/type/lint 后提交。

## Task 3：来源、可见性、资产生命周期、权限和 Agent 搜索引用

文件：

- 新增 `packages/domain/test/knowledge-access.test.ts`
- 新增 `packages/domain/src/knowledge-access.ts`
- 修改 `packages/domain/src/index.ts`

步骤：

1. 先写内部 enum/schema 和查询边界测试。
2. 写 citation 校验测试：workspace/user 上下文、文档 revision、fragment/evidence key、已授权业务引用、数据截止时间。
3. 定义 `KnowledgePermissionPort`、`KnowledgeDocumentTargetResolver` 与 `KnowledgeSearchPort`；搜索请求必须携带租户和用户，结果由端口保证已裁权。
4. 对返回 citation 做运行时解析，拒绝跨 workspace、越界分数、过长 fragment 和不安全引用。
5. 跑定向 test/type/lint 后提交。

## Task 4：全量质量门禁、零契约差异与审查回执

文件：

- 新增 `docs/evidence/B8-代码质量报告.md`
- 修改 `docs/plans/B8-状态.md`
- 修改 `docs/plans/工作台账.md`
- 修改 `docs/relay/inbox-arch.md`
- 修改 `docs/plans/Codex后端交付总账.md`

步骤：

1. 跑 Domain 全量 test/type/lint/coverage。
2. 跑项目四包回归测试、typecheck、lint、audit 和已有复杂度门禁。
3. 对比 B7a，确认 `packages/contract`、`packages/db/migrations` 零差异。
4. 扫描动态执行、密钥、任意 shell/SQL 入口和原始非法 payload 泄露。
5. 记录证据、SHA、未做范围和待 arch 裁决项，提交 P-012 审查入口。

## 完成定义

- 每个领域行为有失败测试先行证据；
- 本批模块语句覆盖率不低于 80%；
- 代码中不存在数据库/API/前端耦合；
- 权限边界写进端口，不依赖 Agent 提示词；
- contract/migrations 相对 B7a 零差异；
- 分支干净并有可复核的设计、实现、质量和审查提交。
