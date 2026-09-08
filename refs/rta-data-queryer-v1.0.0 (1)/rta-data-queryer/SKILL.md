---
name: rta-data-queryer
description: >-
  按用户需求查询 RTA/广告相关数据；直接查询用 scripts/load（标准库），二次加工用 scripts/analyze（pandas + DuckDB 内存 SQL）。连接器含账号列表、广告/账户实时与账户离线等。userId 默认从环境变量读取。业务结算以离线口径为准。
---

# RTA 数据查询（rta-data-queryer）

按用户需求查询 RTA/广告相关数据：**直接查询**用 `scripts/load`（标准库），**二次加工**用 `scripts/analyze`（pandas + DuckDB 内存 SQL）。连接器含账号列表、广告/账户实时与账户离线等。**业务结算以离线口径为准。**

**路径约定**：`connectors/`、`scripts/` 均相对于 **本 skill 根目录**（与本文档同级）。勿假设 monorepo 父目录或其它仓库路径。

**与 `tencentads-cli` 的关系**：§4 的 **`qihang`** 子命令适合单点配置/辅助查询（任务绑定、文案库、扣量等）；本节 **`get_data` + load 脚本**适合**批量拉取投放效果/结算口径**（账户/广告、实时/离线、多日区间）。二者可组合：先用 **`load_account_list.py`** 取 `account_id`，再拉效果或走 **`tencentads-cli eqq`** 做写操作。

## 能力范围

1. **理解需求**：澄清时间范围、粒度（广告/账户）、口径（实时/离线）、维度与指标。
2. **选对查询方法**：每种查询方法定义在独立文件中，**必须先读对应文件再执行查询或给结论**。
3. **执行查询与分析**：**直接查询**优先 `scripts/load/`（账号列表、账户/广告效果等，封装分页、分批、离线+实时）；原始结果需汇总、对比、异常检测等时用 `scripts/analyze/`；否则可新增脚本并记录用法。

## 口径总原则

| 场景 | 优先选用的方法文件 |
|------|----------------------|
| **分页拉取账号列表**、先取 `account_id` | [connectors/account-list.md](connectors/account-list.md) |
| 需要与**财务/结算**一致 | [connectors/account-offline.md](connectors/account-offline.md) |
| 账户维度、**实时监控/今日** | [connectors/account-realtime.md](connectors/account-realtime.md) |
| **广告维度**、实时排查 | [connectors/ad-realtime.md](connectors/ad-realtime.md) |

**结算与对账**：业务结算以**离线数据**为准；实时口径仅用于运营与即时诊断，不可直接等同于结算结果。

## 查询方法索引（必读其一）

目录 **`connectors/`**：每种 `resource`/口径组合一个连接器说明文件（接口、参数、字段），便于复用与组合。

| 方法 ID | 文件 | 粒度 | 口径 |
|---------|------|------|------|
| `account`（列表） | [connectors/account-list.md](connectors/account-list.md) | 账户行 | 分页元数据 |
| `ad-realtime` | [connectors/ad-realtime.md](connectors/ad-realtime.md) | 广告 | 实时 |
| `account-realtime` | [connectors/account-realtime.md](connectors/account-realtime.md) | 账户 | 实时 |
| `account-offline` | [connectors/account-offline.md](connectors/account-offline.md) | 账户 | 离线 |

## 标准工作流

1. 确认目标：指标、维度、时间、是否需要与结算一致。
2. **userId 鉴权**：所有 `get_data` 请求须带有效 `userId`（服务端校验权限）。**默认不向用户索要或手动填写**：无论用 load 脚本、拼 URL（curl 等）还是 Agent 直接请求，均**先从运行环境**依次读 **`JULANG_OS_USER_IDENTITY`**、**`MOZI_USER_ID`**（占位符如 `null` 视为未设置）作为 `userId`（可为历史数字工号，或 opaque 字符串如 `PSQ…`）。load 脚本内置上述逻辑；CLI 回退参数（`--user-identity` / `--user-id` / `-u`）不出现在 `--help`，仅环境变量均缺失时报错提示。
3. 打开上表中**对应场景**的 `connectors/*.md`（可先 [account-list.md](connectors/account-list.md) 再其它），确认接口参数与字段约束。
4. **执行查询**：优先用 `scripts/load/` 已有脚本**直接拉数**（与 connector 场景一一对应）；无现成覆盖再拼 URL、curl 或 Agent 直接请求。小结果 stdout，大结果落 `cache_data/`（见各脚本 `--help`）。
5. **二次加工**（若需要）：优先 `scripts/analyze/` 做汇总、对比、SQL 等（需 `pip install -r scripts/analyze/requirements.txt`）；无则按需新增并记录用法。
6. 输出时**标明口径与粒度**，若使用实时数据且涉及金额/结算相关，需明确提示「非结算口径」。

## 脚本目录

- **加载数据**：`scripts/load/`（Python 3.9+，仅标准库；在 `load` 目录下执行或 `python scripts/load/xxx.py`）。
  - `load_account_data.py`：账户粒度；**多账户、多日区间**；**有离线则走离线，当日仅实时**；默认对历史日再做 **account_realtime 冗余**：仅当某 `(account_id, ds)` 离线无行时用实时补洞（`_gap_filled_by_realtime`），可用 `--no-redundant-realtime` 关闭；账户分批；输出行统一为 **account_realtime 形**，`_data_source` 区分来源，默认离线行带 `_offline_snapshot`。
  - `load_ad_data.py`：广告粒度（`ad_realtime`）；**`adIds` 与 `accountIds` 均可选**；多账户 / 分批 `adIds` / 多日 `ds`；输出与 `connectors/ad-realtime.md` 一致，并带 `_data_source`、`_query_ds`、可选 `_query_account_ids` / `_query_ad_ids`。
  - `load_account_list.py`：账号列表（`resource=account`）；**默认自动翻页**合并为 List<map>，或 `--one-page` 只拉一页；输出行字段顺序与 `connectors/account-list.md` 的 `rows[]` 一致，并带 `_data_source`、`_page_num`。
  - `rta_common.py`：共用 HTTP 与写出逻辑；`extract_account_list_page` 解析分页 `data.rows`；`resolve_user_identity` 实现环境变量 → 隐藏 CLI 回退的 userId 解析（非脚本调用亦应同样从环境变量取 `userId`）；加载阶段 **ctr / cvr**（`ctr`=点击/曝光，`cvr`=转化/点击，分母为 0 为 null）；需写文件时默认写入**当前工作目录下 `cache_data/`**（`-o` 为绝对路径时除外），见脚本 `--help`。
- **分析（pandas + DuckDB）**：`scripts/analyze/`。安装：`pip install -r scripts/analyze/requirements.txt`。`records_io.py`：List<map> JSON → `DataFrame`；`duckdb_sql.py`：对 DataFrame 执行 SQL（`query_dataframe` / `query_dataframes` / `run_sql`），后续可在此叠加聚合、环比同比等业务封装。
- **其它**：`scripts/` 根下可放与 load/analyze 并列的入口脚本。
- 新增脚本时：文件名体现用途，在脚本顶部用注释说明入参、依赖与示例命令。
