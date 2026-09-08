# account-offline — 离线口径 · 账户粒度

## 定义

- **粒度**：账户（`account_id`）；按 `ds` 分区，区间内可能多行（每个账户 × 日期 × 任务等组合以实际返回为准）。
- **口径**：**离线** MAPI 同步数据；**业务结算、对账以本口径为准**。

> **字段以快手实际返回为准**：本文档字段表沿用既有 schema，首次实跑后若快手返回字段名/语义不同，请按真实 JSON 校正本表与 `scripts/load/load_account_data.py` 的离线→实时形字段映射。

## 何时使用 / 不用

- **使用**：结算对齐、对账、与财务/客户报告一致的消耗与效果；见 [SKILL.md](../SKILL.md) 路由。
- **不用**：实时监控 → [account-realtime.md](account-realtime.md)；广告下钻 → [ad-realtime.md](ad-realtime.md)。

## 权威说明

**业务结算以离线数据为准。** 实时口径（[ad-realtime.md](ad-realtime.md)、[account-realtime.md](account-realtime.md)）不得作为最终结算依据。

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
| `resource` | 是 | 固定为 `account_offline` |
| `userId` | 是 | 调用方用户 ID；**服务端据此校验访问权限**，见下节 |
| `beginDate` | 是 | 起始日期，`YYYYMMDD`，例如 `20260410` |
| `endDate` | 是 | 结束日期，`YYYYMMDD`，例如 `20260413`（区间含意以服务端为准） |
| `media` | 是 | 媒体，本 skill 默认 `KUAISHOU` |
| `accountIds` | 否 | 账户 ID，多个用英文逗号分隔、无空格；不传则由服务按 `userId` 在权限范围内返回（具体规则以服务端为准） |

**`userId` 与权限（重要）**：`userId` 用于服务端校验可见数据范围。**默认不向用户索要或手动填写**：Agent、脚本或拼 URL 时，先从运行环境依次读 `JULANG_OS_USER_IDENTITY`、`MOZI_USER_ID`（占位符如 `null` 视为未设置）。须与**真实操作者（有权限的用户）**一致；无权限或错误 userId 会导致失败或空结果。

### 示例 URL

```text
https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data?resource=account_offline&userId=2325656&beginDate=20260410&endDate=20260413&media=KUAISHOU&accountIds=78106571,78106662
```

不传 `accountIds` 时，可省略 URL 中的 `&accountIds=...` 段（返回范围以服务端为准）。

---

## 响应结构

### 顶层

| 字段 | 类型 | 说明 |
|------|------|------|
| `successful` | boolean | 是否成功 |
| `code` | string | 业务码，成功时可为空串 |
| `message` | string | 提示信息 |
| `data` | array | 离线明细列表，见下表 |
| `traceId` | null/string | 链路追踪 ID |
| `rt` | null/number | 耗时等，视服务实现 |

### `data[]` 单条字段

以下为字段含义；若服务端增删字段，以实际 JSON 为准。部分字段可能在特定业务线下才返回（如 `cash`、`income`）。

**按 `biz_name` 解读**：同一字段在不同业务线下含义可能不同。**当 `biz_name=CVR` 时，`newaac_uv_attrib_install` 即转化 UV。** 其他业务类型下该字段（及是否可视为「转化」）**待定**，需结合业务文档或数仓口径再定。

| 字段 | 说明 |
|------|------|
| `channel_id` | 渠道 ID |
| `media` | 媒体 |
| `account_id` | 账户 ID |
| `account_name` | 账户名称 |
| `task_id` | 任务 ID |
| `task_name` | 任务名称 |
| `biz_name` | 业务名称 |
| `cost_api` | 消耗（MAPI） |
| `exp_pv_api` | 曝光（MAPI） |
| `clk_api` | 点击（MAPI） |
| `cash` | 现金消耗 |
| `income` | 赠款 |
| `newaac_uv_attrib_install` | 有端归因新 AAC UV；**转化 UV 等业务语义见上「按 `biz_name` 解读」** |
| `newaac_uv_attrib_uninstall_1h` | 无端 1h 内归因新 AAC UV |
| `wake_uv` | 唤端 UV |
| `aac_ptt_uv` | AAC 潜客 UV |
| `newdac_uv_attrib_install` | 有端归因新 DAC UV |
| `newdac_uv_attrib_uninstall_1h` | 无端 1h 内归因新 DAC UV |
| `new_ad_cnt_d` | 当日新建广告数 |
| `new_ad_cnt_l3d` | 近 3 日新建广告数 |
| `ad_cnt` | 总广告数 |
| `rebate` | 返点 |
| `ds` | 日期（分区/统计日，`YYYYMMDD`） |

### 响应示例（节选）

成功时 `successful` 为 `true`，`data` 为对象数组。结构示例：

```json
{
  "successful": true,
  "code": "",
  "message": "",
  "data": [
    {
      "task_name": "电商下单（CVR-有端）-1",
      "wake_uv": 2035,
      "newaac_uv_attrib_install": 3,
      "rebate": 1.0250000000,
      "exp_pv_api": 23797,
      "biz_name": "CVR",
      "task_id": "302271253",
      "newaac_uv_attrib_uninstall_1h": 0,
      "media": "KUAISHOU",
      "new_ad_cnt_d": 7,
      "ds": "20260411",
      "aac_ptt_uv": 2004,
      "newdac_uv_attrib_install": 3,
      "account_id": "78106662",
      "new_ad_cnt_l3d": 28,
      "account_name": "…",
      "clk_api": 4228,
      "cost_api": 185130,
      "channel_id": "4220010227",
      "newdac_uv_attrib_uninstall_1h": 0,
      "ad_cnt": 28
    }
  ],
  "traceId": null,
  "rt": null
}
```

---

## 输出说明

向用户标明：**账户粒度、离线口径、结算/对账优先参考**；与实时接口对比时需说明二者定义与延迟差异。

## 加载脚本

本 skill 内 **`scripts/load/load_account_data.py`** 可**直接拉数**（多账户、多日区间；历史日走离线、当日走实时，并可选离线兜底补洞）。输出统一为 account_realtime 形字段，`_data_source` 区分来源。`media` 默认 `KUAISHOU`，`userId` 从环境变量自动读取（见 [SKILL.md](../SKILL.md)）；仅标准库，`--help` 查看参数。
