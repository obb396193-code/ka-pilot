# BUC 登录接入定案（OS 三轮问答回收）

> 2026-08-18 归档。来源：OS 实测 + 官方文档《申请buc应用和配置》。
> **一句话：模板现成 ≠ 开箱即登。代码和建仓权限全齐，差的是"BUC 应用注册+白名单"一个自助表单（10 分钟，无审批），且 daily 登录问题官方有解。**

## 1. 事实清单（OS 查实）

| 项 | 状态 |
|---|---|
| scaffold-id 10「Next.js BUC 中后台模板」 | ✅ 在平台注册表（实测 template list 列出） |
| 但不在轻量链路 | ⚠️ 要走 `a1 faas create aone-platform`（新建 Aone 应用+Code 仓库），部署用 `a1 faas publish <env>` 走流水线——比探测应用重一档 |
| Code group 权限 | ✅ 老板有 HHH 和 bpj02291154（个人 group），create 条件满足 |
| 模板源仓库读取 | ❌ 403（但 create 走平台脚手架，理论不受影响；实建一次才知道） |
| BUC 注册 | **自助表单，无审批环节**（官方文档确认） |
| daily 环境 BUC 网络问题 | **官方解法：daily 直接对接 BUC 线上**（login.alibaba-inc.com），跳过 login-test |

## 2. 接入流程（四步，分工明确）

```
① agent：a1 faas create aone-platform 建函数组应用（需老板确认四项：应用名/group(建议 bpj02291154)/project 名/scaffold-id 10）→ 产出 Aone ID
② 老板本人：login.alibaba-inc.com/apply.htm 填表（约 10 分钟）
   - 应用名（=登录跳转 URL 里的 APP_NAME，建议与 Aone 应用名一致）
   - Aone ID（第①步产出）
   - 域名白名单：<应用名>.pre-fn.alibaba-inc.com,<应用名>.fn.alibaba-inc.com,<应用名>.fn.taobao.net
     （host 不在白名单会报错提示，可事后补加，不是一次定死）
   - 责任人=老板；登录权限审批人=老板；安全配置全默认
③ 老板本人：updateAppInfoList.htm → 查看/编辑 → 取 AppCode/ClientKey
   ⚠️ 绝不贴聊天/评论，直接 config vars 配
   ＋ 申请权限包：把应用登录权限加入正式员工基础权限包（否则每个同事首次登录都要单独审批）
④ agent：a1 faas config vars set BUC_CLIENTKEY=... NEXTAUTH_SECRET=$(openssl rand -base64 32) → 部署 → 验证登录
```

## 3. 技术细节（写代码直接用）

- OIDC + NextAuth.js
- **必打补丁**：BUC 私钥 modulus 不合标准，社区 jose 拒绝验签 → 换 `@ali/xy-jose@4.15.4`
- Ticket 模式（如用）：`@ali/harmony-buc-login` ≥1.0.9，每 5 分钟刷新 token
- daily 环境 env 指向 BUC **线上**（不是 login-test），白名单含 `.fn.taobao.net`

## 4. 节奏决策（已与 OS 对齐）

- **demo 期（现在）**：先不接登录。daily 内网 URL 本身只有内网可访问，几个同事试用风险可控，精力放数据大盘。
- **接登录时机**：与 create aone-platform 一起做（那一步会留组织足迹——建 Aone 应用+Code 仓库，台账 #26 的"公开登记"时点）。届时按 §2 四步走。
