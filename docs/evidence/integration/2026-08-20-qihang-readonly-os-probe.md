# 2026-08-20 Qihang read-only OS probe

> 仅含脱敏证据；原始回传不进入仓库。

## 环境与范围

- 环境：内网 OS Agent 沙箱，Python 3.12.3，`ks-data-queryer/scripts/load/ks_common.py` 标准库 HTTP 封装。
- 应用版本 / 代码 SHA：本项目未参与请求，N/A。
- 配置版本：OS 当前合法身份；身份值未回传。
- 执行人：经老板授权的 OS Agent；具体人员信息不记录。
- 时间：2026-08-20；开始/结束精确时间未回传。
- 授权范围：当前 userId 可见的快手账户；标识和精确规模已脱敏。

## 输入规模与对象

- `account`：最小分页。
- `account_offline`：最小日期窗；D-1 空，D-2 命中。
- `account_realtime`：当日权限范围。
- `ad_realtime`：单个已授权账户、当日最小范围。
- 全部为 GET，只读；无越权、无压力、无媒体写操作。

## 外部证据

- 产品 trace/job/run ID：无，本项目未发起。
- 外部 trace ID：成功响应中为 null。
- HTTP：四资源均为 200，业务层 `successful=true`、空 code/message。
- 重试：本轮未报告上游重试。
- 耗时、行数、字节数：OS 已测量；为避免真实业务规模入仓，仅记录全部低于当前 Client 的响应/行/ID/URL 保护预算。
- 空数据：`successful=true` 且 `data=[]`。
- 日期：请求 `YYYYMMDD`；响应 `ds=YYYYMMDD`。
- 身份：query 显式传 userId；Skill 可从 `JULANG_OS_USER_IDENTITY` / `MOZI_USER_ID` 读取并代填，变量值未回传。

## Schema 结论

- `account` 为分页对象，行含账户/任务/业务/media/budget 基础字段。
- 其余三个 resource 为数组。
- `account_offline` 是动态 Schema：本次字段少于旧文档，并新增 `account_real_conversion`。
- `account_realtime`、`ad_realtime` 本次样本字段稳定且无 null，但不能据此断言所有业务永不缺字段。

## 仍未证实

- `hh` 真实行为。
- offline 跨日区间与服务端上限。
- 分区“部分产出/完整产出”状态。
- 其它 media。
- 产品 Worker/FaaS→Raw→Canonical→质量同链 trace。
- 服务身份/短时委托。

## 结论

协议层真实只读探针通过；产品级 Gate B 未通过。对应兼容修复和质量结论见 `docs/evidence/B10-真实奇航只读适配报告.md`。
