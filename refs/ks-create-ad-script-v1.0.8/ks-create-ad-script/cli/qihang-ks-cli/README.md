# qihang-ks-cli

启航（Qihang）**快手专属** OpenAPI 终端工具。从 `qihang-cli` 拆分出来，只承载和快手强相关的接口：版位查询素材规格 / 素材共享 / 快手任务配置查询。

通用接口（素材库统计 / 素材库查询 / 启航链接生成 / 扣量配置 / 文案库）请继续使用 `qihang-cli`。

## 安装

```bash
python3 -m pip install --upgrade --force-reinstall /Users/tt_lizongjin/Desktop/julang_cli/qihang-ks-cli
```

入口：

```bash
qihang-ks-cli --help
```

## 子命令

```
inventory spec        快手版位查素材规格（宽高/类型）
share material        快手素材共享到目标账户（写）
kuaishou-task get     快手任务配置查询（RTA、承接页、返点、扣量参数等）
```

每个子命令的详细参数见 `qihang-ks-cli <command> <action> --help`。

## 输出策略（agent 友好）

每个命令都支持全局 `--output-file PATH`，由它决定 stdout 行为：

| 模式 | 触发 | stdout | 文件 |
|---|---|---|---|
| 直回上下文（默认） | 不传 `--output-file` | 完整 JSON 响应 | 无 |
| 落盘 + 摘要 | 传 `--output-file ./xxx.json` | `{savedTo,count,preview前3条,successful}` | 完整响应 pretty-printed |

agent 大数据量查询时建议直接 `--output-file`，避免上下文被打爆。

## 写接口安全约束

`share material` 是**写接口**：

- 不带 `--confirm` 时强制 dry-run，只打印请求体不实发
- 带 `--confirm` 才真发；触发后真实素材会被推送到目标账户

## 环境变量

| 变量 | 作用 |
|---|---|
| `QIHANG_BASE_URL` | 默认 `https://qh.alibaba-inc.com`，可指向预发 `https://pre-xhl-qh3.alibaba-inc.com` |
| `QIHANG_TIMEOUT` | HTTP 超时秒数（默认 180） |
| `PYTHONHTTPSVERIFY` | `0` 跳过 HTTPS 证书校验 |

也支持 `~/.qihang/config.json` 多 profile（与 `qihang-cli` 共用同一份配置）。

## 常用示例

```bash
# 版位查规格
qihang-ks-cli inventory spec --inventory-types KUAI_SHOU_YOU_XUAN OPEN_SCREEN

# 素材共享 dry-run（默认不实发）
qihang-ks-cli share material --account-id 108714412 --signatures abc123

# 素材共享真发
qihang-ks-cli share material --account-id 108714412 --signatures abc123 --confirm

# 快手任务配置查询
qihang-ks-cli kuaishou-task get --task-id 1803240580
```
