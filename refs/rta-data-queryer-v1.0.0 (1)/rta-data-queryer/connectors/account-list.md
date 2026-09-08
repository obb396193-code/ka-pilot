# account — 账号列表（分页）

## 定义

- **用途**：按媒体等条件**分页拉取账号列表**（含任务、业务线、预算等元信息），常用于先取 `account_id` 再调其它 `resource`。
- **粒度**：列表行级（每行一个账户 + 任务等信息）。
- **口径**：**元数据/配置类**，非投放效果统计；与 [account-realtime.md](account-realtime.md)、[account-offline.md](account-offline.md) 的消耗指标不是同一套数据。

## 何时使用 / 不用

- **使用**：需要枚举有权限的账户、按关键字或业务线筛选、分页拼接全量 ID。
- **不用**：要看某日消耗/曝光/点击 → 用 [account-realtime.md](account-realtime.md) 或 [account-offline.md](account-offline.md)。

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
| `resource` | 是 | 固定为 `account` |
| `userId` | 是 | 调用方用户 ID；**服务端据此校验访问权限**，见下节 |
| `returnTotalNum` | 是 | 是否返回总条数，通常为 `true` |
| `pageNum` | 是 | 页码，从 `1` 起 |
| `pageSize` | 是 | 每页条数，例如 `50` |
| `media` | 是 | 媒体，例如 `TENCENT` |
| `keyword` | 否 | 搜索关键字；不需要可传空字符串或不传（以服务端为准） |
| `bizName` | 否 | 业务名称筛选；不需要可传空字符串或不传（以服务端为准） |

**`userId` 与权限（重要）**：`userId` 用于服务端校验可见账号范围。**默认不向用户索要或手动填写**：Agent、脚本或拼 URL 时，先从运行环境依次读 `JULANG_OS_USER_IDENTITY`、`MOZI_USER_ID`（占位符如 `null` 视为未设置；可为数字工号或 opaque 字符串如 `PSQ…`）。须与**真实操作者（有权限的用户）**一致；无权限或错误 userId 会导致失败或空结果。

### 示例 URL

```text
https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data?resource=account&userId=2325656&returnTotalNum=true&pageNum=1&pageSize=50&keyword=&bizName=&media=TENCENT
```

带筛选时可填写 `keyword`、`bizName`；翻页时递增 `pageNum`，并结合 `data.totalNum` / `data.pageSize` 计算总页数。

---

## 响应结构

### 顶层

| 字段 | 类型 | 说明 |
|------|------|------|
| `successful` | boolean | 是否成功 |
| `code` | string | 业务码 |
| `message` | string | 提示信息 |
| `data` | object | 分页体，见下（**注意**：与其它 `get_data` 接口「`data` 为数组」不同） |
| `traceId` | null/string | 链路追踪 ID |
| `rt` | null/number | 耗时等 |

### `data` 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `totalNum` | number | 总记录数 |
| `pageSize` | number | 每页条数 |
| `pageNum` | number | 当前页码 |
| `rows` | array | 当前页账号行列表，见下表 |

### `data.rows[]` 单条字段

| 字段 | 说明 |
|------|------|
| `account_id` | 账户 ID |
| `task_id` | 任务 ID |
| `task_name` | 任务名称 |
| `biz_name` | 业务名称 |
| `media` | 媒体 |
| `budget` | 预算 |

### 响应示例（节选）

```json
{
  "successful": true,
  "code": "",
  "message": "",
  "data": {
    "totalNum": 138,
    "pageSize": 50,
    "pageNum": 1,
    "rows": [
      {
        "task_name": "淘宝闪购MCVR—仅排除",
        "account_id": "78129089",
        "biz_name": "频道_淘宝闪购MCVR",
        "task_id": "703153690",
        "media": "TENCENT",
        "budget": 10000
      },
      {
        "task_name": "淘宝闪购MCVR—仅排除",
        "account_id": "78129068",
        "biz_name": "频道_淘宝闪购MCVR",
        "task_id": "703153690",
        "media": "TENCENT",
        "budget": 10000
      }
    ]
  }
}
```

---

## 输出说明

向用户说明：本接口为**账号列表分页**，用于解析 `account_id` 等；若接着查效果/结算，需再选 [account-realtime.md](account-realtime.md)、[account-offline.md](account-offline.md) 等连接器。

## 加载脚本

本 skill 内 **`scripts/load/load_account_list.py`** 可**直接拉数**并合并多页为 `List<map>` JSON；每行字段顺序与本节「`data.rows[]` 单条字段」表一致，并附加 `_data_source`、`_page_num`。`userId` 从环境变量自动读取（见 [SKILL.md](../SKILL.md)）；仅标准库，`--help` 查看参数。
