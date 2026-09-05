# ka-src-0011 评估：ka-data 取数对接（给开发）

> 审查：arch(Claude) 2026-09-05。证据等级 E2：内网 OS agent 已按本文实跑取数（老板转述），本机未运行。

## 与 ka-src-0010 的关系
同一服务的「给开发」精简版，新增四样：沙箱会话地址形态与重取方法、reader token 签发/吊销命令（`issue_token.py`，tokens.json 热加载）、`a1 faas config vars set` 注入方式、一个已跑通的 daily 看板实例。

## 对产品的直接结论
| 项 | 结论 |
|---|---|
| 请求/响应契约 | 与 `apps/worker/src/data/ka-data-client.ts` **一致**（body `{backend,sql,limit}`；响应 `rowCount/rows/truncated/limit_clamped/note`）；无需改 adapter |
| 服务地址 | **沙箱会话地址，重启即变**——只能当内测源；正式前需稳定域名（硬门，记 OS 二.2 追问）。运行期 origin 固定 → 地址变 = 改 config var + 重启 data-api |
| token | reader 只读；有 `--list/--revoke`；无有效期/审计说明（追问）；只进 Secret，不进前端（与 DATA-ROUTE-001 一致） |
| 一枚 reader 全渠道可见？ | 文档暗示「读 owner 拥有的全部数据」→ 团队空间可用一枚；**待 OS 二.2d 明确** |
| 现金 | `SUM(cash_yuan)` 直接用，**团队空间不再施加 channel_coefficients**（否则双算）；null 走三态 missing |
| 考核价 | `dwd_account_daily.assessment/cash_assessment` 已按 sub_biz×media 富化；SSOT 在 ka-knowledge `assessment_catalog.json`（53 条）→ 团队空间达标直接用列；个人空间仍走 `assessment_price_history` |
| 8 维 | `dwd_adgroup_daily` 有 `resource_position/bid_tool/plan_tier/operator_name/channel_type/deduction_rate` → **团队空间资源位/出价工具有源**；个人空间（奇航）仍等 OS 二.1 |
| namespace | `dwd_adgroup` 的 account_id ≠ `dwd_account/fact_conv` 的，不可 JOIN；赔付 JOIN 必带 media → 团队空间 8 维透视的 ad 级与账户级**分别查、不 JOIN** |
| 转化 | 必加 `media=\'KUAISHOU\'`，否则差 12 倍 |

## 安全/治理项（保留 ka-src-0010 的结论）
共享 reader token 只进 Secret；不开任意 SQL 给用户（Registry 生成）；不依赖临时沙箱 URL 作正式；SQLite 快照不作产品主库。
