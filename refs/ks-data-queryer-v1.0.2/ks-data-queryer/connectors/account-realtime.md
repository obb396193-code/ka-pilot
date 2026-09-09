# account-realtime — 实时口径 · 账户粒度

## 定义

- **粒度**：账户（`account_id`）。
- **口径**：**实时**（接口返回含 `last_sync_time` 等；不等同于离线批处理或结算）。

> **字段以快手实际返回为准**：本文档字段表沿用既有 schema，首次实跑后若快手返回字段名/语义不同，请按真实 JSON 校正本表与 `scripts/load` 的字段映射（含 ctr/cvr 派生字段）。

## 何时使用 / 不用

- **使用**：账户整体消耗、预算、曝光/点击/转化等汇总监控；见 [SKILL.md](../SKILL.md) 路由。
- **不用**：结算/对账 → [account-offline.md](account-offline.md)；需广告下钻 → [ad-realtime.md](ad-realtime.md)。

---

## 接口说明

### 请求

| 项 | 值 |
|----|-----|
| 方法 | `GET` |
| 基础路径 | `https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data` |

### Query 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `resource` | 是 | 固定为 `account_realtime` |
| `userId` | 是 | 调用方用户 ID；**服务端据此校验访问权限**，见下节 |
| `ds` | 是 | 分区日期，`YYYYMMDD`，例如 `20260414` |
| `media` | 是 | 媒体，本 skill 默认 `KUAISHOU` |
| `accountIds` | 否 | 账户 ID，多个用英文逗号分隔、无空格；不传则由服务按 `userId` 在权限范围内返回（具体规则以服务端为准） |

**`userId` 与权限（重要）**：`userId` 用于服务端校验可见数据范围。**默认不向用户索要或手动填写**：Agent、脚本或拼 URL 时，先从运行环境依次读 `JULANG_OS_USER_IDENTITY`、`MOZI_USER_ID`（占位符如 `null` 视为未设置）。须与**真实操作者（有权限的用户）**一致；无权限或错误 userId 会导致失败或空结果。

### 示例 URL

```text
https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data?resource=account_realtime&userId=2325656&ds=20260414&media=KUAISHOU&accountIds=78106571,78106662
```

不传 `accountIds` 时，可省略上述 URL 中的 `&accountIds=...` 段（返回范围以服务端为准）。

---

## 响应结构

### 顶层

| 字段 | 类型 | 说明 |
|------|------|------|
| `successful` | boolean | 是否成功 |
| `code` | string | 业务码，成功时可为空串 |
| `message` | string | 提示信息 |
| `data` | array | 账户明细列表，见下表 |
| `traceId` | null/string | 链路追踪 ID |
| `rt` | null/number | 耗时等，视服务实现 |

### `data[]` 单条字段

以下为接口返回行内字段含义；若服务端增删字段，以实际 JSON 为准。

| 字段 | 说明 |
|------|------|
| `account_id` | 账户 ID |
| `account_name` | 账户名称 |
| `media` | 媒体 |
| `ds` | 统计日期（`YYYYMMDD`） |
| `task_id` | 任务 ID |
| `biz_name` | 业务 |
| `is_main_account` | 是否主账户 |
| `last_sync_time` | 最近同步时间 |
| `account_budget` | 账户预算 |
| `account_budget_usage_rate` | 账户预算使用率 |
| `account_cost` | 账户消耗 |
| `account_exposure` | 曝光 PV |
| `account_click` | 点击 PV |
| `account_conversion` | 账户 OCPX 回传数 |
| `account_real_conversion` | 账户真实转化数 |
| `account_cpa` | 账户 CPA，账户真实转化成本；**有真实转化时才返回**（账户转化=0 时多被省略） |
| `account_deduction_rate` | 账户 OCPX 扣量比例 |
| `account_main_ad_cost` | 主力广告消耗 |
| `account_main_ad_cost_proportion` | 主力广告消耗占账户消耗比例 |
| `assessment_cost` | 考核成本 |

### 响应示例（节选）

成功时 `successful` 为 `true`，`data` 为对象数组。下例为一条**无真实转化**的账户行（故缺 `account_cpa`）：

```json
{
  "successful": true,
  "code": "",
  "message": "",
  "data": [
    {
      "account_click": 78,
      "is_main_account": 0,
      "last_sync_time": "2026-05-29 10:58:03",
      "biz_name": "CVR",
      "task_id": "1803240580",
      "media": "KUAISHOU",
      "account_budget": 1000.0,
      "ds": "20260529",
      "account_exposure": 4962,
      "account_main_ad_cost": 44.34,
      "account_id": "107862574",
      "account_main_ad_cost_proportion": 0.887037,
      "account_real_conversion": 0,
      "account_name": "…",
      "account_cost": 49.99,
      "account_conversion": 0,
      "assessment_cost": 34.0,
      "account_budget_usage_rate": 0.04999,
      "account_deduction_rate": 0
    }
  ],
  "traceId": null,
  "rt": null
}
```

---

## 输出说明

向用户标明：**账户粒度、实时接口、非结算口径**；金额/消耗类指标若用于对账，需引导至 [account-offline.md](account-offline.md)。

## 加载脚本

本 skill 内 **`scripts/load/load_account_data.py`** 可**直接拉数**（多账户、多日；等于「今日」走本接口，历史日默认走离线）。输出统一为 account_realtime 形字段。`media` 默认 `KUAISHOU`，`userId` 从环境变量自动读取（见 [SKILL.md](../SKILL.md)）；仅标准库，`--help` 查看参数。
