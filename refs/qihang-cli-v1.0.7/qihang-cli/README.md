# qihang-cli

启航（Qihang）OpenAPI 终端工具（**通用**部分）。封装到 `https://qh.alibaba-inc.com` 的跨媒体接口：素材库统计 / 素材库按商品查询 / 启航链接生成 / 文案库查询。命令文档以 `--help` 为准。

> 快手专属能力（版位查规格 / 素材共享 / 账户复制 / 快手任务配置查询）已拆分到 [`qihang-ks-cli`](../qihang-ks-cli/README.md)。

## 安装

```bash
python3 -m pip install --upgrade --force-reinstall /Users/tt_lizongjin/Desktop/julang_cli/qihang-cli
```

入口：

```bash
qihang-cli --help
qihang --help
```

## 子命令

```
material count       素材库 (商品 id, 素材类型) 数量统计（商品 id 为空的素材以 key="" 返回）
material list        按商品 id 查询素材明细，支持 NULL 表示"无商品信息"
material list-all    按商品 id 一把拉全（自动分页循环）
link build           启航链接批量生成（--media 必填；KUAISHOU 强制要求 --delivery-target）
textpool list        CVR 文案池内容查询（dataservice-api）
account list-by-user 按 userId + 媒体查询有权限的账户列表（private-dataservice-api）
```

每个子命令的详细参数见 `qihang-cli <command> <action> --help`。

## 输出策略（agent 友好）

每个命令都支持全局 `--output-file PATH`，由它决定 stdout 行为：

| 模式 | 触发 | stdout | 文件 |
|---|---|---|---|
| 直回上下文（默认） | 不传 `--output-file` | 完整 JSON 响应 | 无 |
| 落盘 + 摘要 | 传 `--output-file ./xxx.json` | `{savedTo,count,preview前3条,successful}` | 完整响应 pretty-printed |

agent 大数据量查询时建议直接 `--output-file`，避免上下文被打爆。

## 环境变量

| 变量 | 作用 |
|---|---|
| `QIHANG_BASE_URL` | 默认 `https://qh.alibaba-inc.com`，可指向预发 `https://pre-xhl-qh3.alibaba-inc.com` |
| `QIHANG_TIMEOUT` | HTTP 超时秒数（默认 180） |
| `PYTHONHTTPSVERIFY` | `0` 跳过 HTTPS 证书校验 |

也支持 `~/.qihang/config.json` 多 profile（与 `qihang-ks-cli` 共用同一份配置）。

## 常用示例

```bash
# 素材库统计（含无商品信息的素材，以 key="" 返回）
qihang-cli material count --media KUAISHOU --pool-id 75342

# 素材库按商品查询，落盘
qihang-cli material list --media KUAISHOU --pool-id 75342 \
    --item-ids 953188315618 --page-size 50 --output-file ./materials.json

# 查询无商品信息的素材
qihang-cli material list --media KUAISHOU --pool-id 75342 \
    --item-ids NULL --page-size 10

# 混合查询：指定商品 + 无商品信息
qihang-cli material list --media KUAISHOU --pool-id 75342 \
    --item-ids 953188315618 NULL --page-size 10

# 字段精简
qihang-cli material list --media KUAISHOU --pool-id 75342 \
    --item-ids 953188315618 --page-size 3 --fields SIGNATURE URL WIDTH HEIGHT

# 启航链接批量生成（KUAISHOU 必须传 --delivery-target；候选 180=激活/190=付费/394=下单/324=应用唤起/53=表单数）
qihang-cli link build --media KUAISHOU \
    --advertiser-id 108714412 --task-id 1803240580 \
    --page-id landing_v2_1314 --delivery-target 394 \
    --input tmp/material_groups.json \
    --output-file tmp/links.json

# 文案池查询
qihang-cli textpool list --pool-id 376

# 按 userId 查有权限的账户列表
qihang-cli account list-by-user --media KUAISHOU --user-id 111515362
```
