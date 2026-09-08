# kuaishou-cli

快手 MAPI 信息流投放 CLI。命令文档以 `--help` 为准。

## 安装

```bash
python3 -m pip install --upgrade --force-reinstall /Users/tt_lizongjin/Desktop/kuaishou-cli-v1.0.0
```

入口：

```bash
kuaishou-cli --help
kuaishou --help
```

## 子命令

```
raw      透传调用任意快手 MAPI 接口
account  广告主信息 / 余额 / 预算 / 流水
campaign 计划（一级）查询与创建
unit     广告组（二级）查询与创建
material 素材上传、共享、标签查询
creative 创意（三级）查询与创建
```

每个子命令的详细参数见 `kuaishou-cli <command> --help` 和 `kuaishou-cli <command> <action> --help`。

### unit update-schedule（批量改投放时段）

`schedule_time` 为 168 位 0/1 字符串（24×7，1 小时粒度，周一 00:00 起）。CLI 提供三种入口：

```bash
# 直接指定 unit + 内置预设
kuaishou-cli unit update-schedule --unit-ids 1,2,3 --preset workday_9_22

# 账户下全部广告组 + 自定义时段（先翻页拉 unit/list 再逐个 update）
kuaishou-cli unit update-schedule --all --days mon,tue,wed,thu,fri --from 9 --to 22

# 直传 168 位串（高手模式）
kuaishou-cli unit update-schedule --unit-ids 1 --schedule-time 111...0

# 先 dry-run 看 payload 和受影响 unit 数
kuaishou-cli unit update-schedule --all --preset all_day --dry-run
```

可选预设：`all_day`、`workday_9_22`、`workday_full`、`weekend_only`、`evening_18_24`。

行为：单 unit 单请求、遇错跳过继续，结果 JSON 含 `success` / `failure` / `failed_unit_ids` / per-unit 明细；非 dry-run 模式下只要有失败就以退出码 1 退出。

## Access Token 策略（占位符模式）

CLI **本身不获取 token**。所有发出的请求 `Access-Token` / `Authorization` header 默认填固定占位符字符串 `<token>`，真实 token 由**上游代理**在发送前替换。CLI 因此可以保持无状态、无鉴权依赖。

```jsonc
// dry-run 输出（默认）
"headers": {
  "Access-Token": "<token>",
  "Authorization": "<token>",
  ...
}
```

### `--token VALUE`（仅排查问题时用）

全局 flag，作用是把占位符 `<token>` 覆盖成真实 token，让 CLI 直接发出可执行请求——**生产路径不需要它**，只有当你想绕过代理、本地直连 MAPI 复现问题时才用：

```bash
kuaishou-cli --token=abcdef123456 account info --advertiser-id 108714412
```

## 环境变量

| 变量 | 作用 |
|---|---|
| `KUAISHOU_ADVERTISER_ID` | 默认广告主 ID |
| `KUAISHOU_BASE_URL` | 覆盖 MAPI Base URL |
| `KUAISHOU_TIMEOUT` | HTTP 超时秒数 |
| `PYTHONHTTPSVERIFY` | `0` 跳过 HTTPS 证书校验 |
