# algorithm-cli

算法数据服务终端工具。封装 `private-dataservice-api.dw.alibaba-inc.com` 上的三类 GET 查询：动态出价信息 / 算法素材 / 动态投放数据。命令文档以 `--help` 为准。

## 安装

```bash
python3 -m pip install --upgrade --force-reinstall /Users/tt_lizongjin/Desktop/julang_cli/algorithm-cli
```

入口：

```bash
algorithm-cli --help
algorithm --help
```

## 子命令

```
info query       动态出价信息查询（/query/dynamic/bid/info）
material query   算法素材查询（/query/algorithm/material）
data query       动态投放数据查询（/query/dynamic/data）
```

每个子命令的详细参数见 `algorithm-cli <command> query --help`。

## 必填参数

三个查询命令均要求：

| 参数 | CLI flag | 说明 |
|---|---|---|
| ds | `--ds` | 分区日期，格式 yyyyMMdd |
| pageNum | `--page` | 页码，默认 1 |
| pageSize | `--page-size` | 每页条数，默认 10 |

其余过滤条件均为可选，不传时等价于空字符串过滤。

## 输出策略（agent 友好）

每个命令都支持全局 `--output-file PATH`：

| 模式 | 触发 | stdout | 文件 |
|---|---|---|---|
| 直回上下文（默认） | 不传 `--output-file` | 完整 JSON 响应 | 无 |
| 落盘 + 摘要 | 传 `--output-file ./xxx.json` | `{savedTo,count,preview前3条,errCode}` | 完整响应 pretty-printed |

## 环境变量

| 变量 | 作用 |
|---|---|
| `ALGORITHM_BASE_URL` | 默认 `https://private-dataservice-api.dw.alibaba-inc.com` |
| `ALGORITHM_APP_CODE` | 默认内置 appCode |
| `ALGORITHM_TIMEOUT` | HTTP 超时秒数（默认 180） |
| `PYTHONHTTPSVERIFY` | `0` 跳过 HTTPS 证书校验 |

也支持 `~/.algorithm/config.json` 多 profile。

## 常用示例

```bash
# 动态出价信息
algorithm-cli info query --ds 20250610

# 算法素材（带过滤 + 落盘）
algorithm-cli material query --ds 20250610 --media KUAISHOU --page-size 50 \
    --output-file ./materials.json

# 动态投放数据
algorithm-cli data query --ds 20250610 --task-id 123 --account-id 108714412
```

## 接口联通性

三个接口均已验证 HTTP 200、`errCode=0` 响应结构：

```json
{
  "data": { "totalNum": 0, "pageSize": 10, "rows": [], "pageNum": 1 },
  "errCode": 0,
  "errMsg": "success"
}
```
