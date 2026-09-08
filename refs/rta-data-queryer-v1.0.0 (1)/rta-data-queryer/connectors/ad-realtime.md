# ad-realtime — 实时口径 · 广告粒度

## 定义

- **粒度**：广告（`ad_id`）。
- **口径**：**实时**（接口返回含 `last_sync_time` 等，用于运营与即时诊断）。

## 何时使用 / 不用

- **使用**：广告维度排查展现、点击、消耗、转化等；见上文 [SKILL.md](../SKILL.md) 路由。
- **不用**：结算/对账 → [account-offline.md](account-offline.md)；只要账户汇总 → [account-realtime.md](account-realtime.md)。

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
| `resource` | 是 | 固定为 `ad_realtime` |
| `userId` | 是 | 调用方用户 ID；**服务端据此校验访问权限**，见下节 |
| `ds` | 是 | 分区日期，`YYYYMMDD`，例如 `20260414` |
| `media` | 是 | 媒体，例如 `TENCENT` |
| `accountIds` | 否 | 账户 ID，多个用英文逗号分隔、无空格；不传则由服务按 `userId` 权限在可用范围内返回（具体规则以服务端为准） |
| `adIds` | 否 | 广告 ID，多个用英文逗号分隔、无空格；不传则由服务在可见范围内返回（与 `accountIds` 组合规则以服务端为准） |
| `hh` | 否 | 累计小时：**0～hh**（含）时段的数据；**不传则默认全天（0～24）** |

**`userId` 与权限（重要）**：`userId` 用于服务端校验可见数据范围。**默认不向用户索要或手动填写**：Agent、脚本或拼 URL 时，先从运行环境依次读 `JULANG_OS_USER_IDENTITY`、`MOZI_USER_ID`（占位符如 `null` 视为未设置）。须与**真实操作者（有权限的用户）**一致；无权限或错误 userId 会导致失败或空结果。

### 示例 URL

```text
https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data?resource=ad_realtime&userId=2325656&ds=20260414&media=TENCENT&accountIds=78106571&adIds=93920275766,94089748117
```

仅按账户拉取、不传 `adIds` 时示例（参数组合以服务端为准）：

```text
https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data?resource=ad_realtime&userId=2325656&ds=20260414&media=TENCENT&accountIds=78106571
```

指定截至某小时（例如截至 18 点）时在上述 URL 末尾追加 `&hh=18`。可按需省略 `accountIds`、`adIds`（仅保留 `userId`、`ds`、`media` 等），返回范围以服务端为准。

---

## 响应结构

### 顶层

| 字段 | 类型 | 说明 |
|------|------|------|
| `successful` | boolean | 是否成功 |
| `code` | string | 业务码，成功时可为空串 |
| `message` | string | 提示信息 |
| `data` | array | 广告明细列表，见下表 |
| `traceId` | null/string | 链路追踪 ID |
| `rt` | null/number | 耗时等，视服务实现 |

### `data[]` 单条字段

以下为接口返回行内字段含义；若服务端增删字段，以实际 JSON 为准。

| 字段 | 说明 |
|------|------|
| `is_old_ad` | 是否老广告：创建超过 3 天记为老广告 |
| `account_deduction_rate_h` | 账户 OCPX 扣量比例 |
| `ad_budget_h` | 广告预算（元） |
| `ad_budget_usage_rate_h` | 广告预算使用率 |
| `is_main_ad_h` | 是否主力广告 |
| `ad_cost_h` | 消耗 |
| `ad_name` | 广告名称 |
| `ad_cpm_h` | 广告 CPM（元） |
| `last_sync_time` | 最近同步时间 |
| `biz_name` | 业务 |
| `task_id` | 任务 ID |
| `ad_conversion_h` | 广告 OCPX 回传数 |
| `media` | 媒体 |
| `ad_create_time` | 广告创建时间（`YYYYMMDD`） |
| `ds` | 统计日期（`YYYYMMDD`） |
| `ad_real_conversion_h` | 广告真实转化数 |
| `ad_id` | 广告 ID |
| `account_id` | 账户 ID |
| `account_name` | 账户名称 |
| `account_ad_cpm_avg_h` | 账户下广告平均 CPM |
| `ad_bid_h` | 广告出价 |
| `ad_exposure_h` | 曝光 PV |
| `ad_click_h` | 点击 PV |
| `ad_real_cpa_h` | 真实转化成本 |
| `ad_cpa_h` | 账面转化成本 |
| `assessment_cost` | 考核成本，考核真实转化成本 |

### 响应示例（节选）

成功时 `successful` 为 `true`，`data` 为对象数组。结构示例：

```json
{
  "successful": true,
  "code": "",
  "message": "",
  "data": [
    {
      "is_old_ad": 0,
      "account_deduction_rate_h": 60,
      "ad_budget_h": 999999,
      "ad_budget_usage_rate_h": 0.000014,
      "is_main_ad_h": 1,
      "ad_cost_h": 14,
      "ad_name": "030529-0412-hot",
      "ad_cpm_h": 5,
      "last_sync_time": "2026-04-14 23:53:56",
      "biz_name": "CVR",
      "task_id": "302271253",
      "ad_conversion_h": 0,
      "media": "TENCENT",
      "ad_create_time": "20260412",
      "ds": "20260414",
      "ad_real_conversion_h": 0,
      "ad_id": "94089748117",
      "account_id": "78106571",
      "account_name": "…",
      "account_ad_cpm_avg_h": 10,
      "ad_bid_h": 70,
      "ad_exposure_h": 2637,
      "ad_click_h": 430,
      "ad_real_cpa_h": null,
      "ad_cpa_h": null,
      "assessment_cost": null
    }
  ],
  "traceId": null,
  "rt": null
}
```

---

## 输出说明

向用户标明：**广告粒度、实时接口、非结算口径**；金额/消耗类指标若用于对账，需引导至 [account-offline.md](account-offline.md)。

## 加载脚本

本 skill 内 **`scripts/load/load_ad_data.py`** 可**直接拉数**（`adIds` / `accountIds` 均可选；支持多账户 plan、分批、多日）。输出字段与本节 `data[]` 一致，并附加 `_data_source`、`_query_ds` 等。`userId` 从环境变量自动读取（见 [SKILL.md](../SKILL.md)）；仅标准库，`--help` 查看参数。
