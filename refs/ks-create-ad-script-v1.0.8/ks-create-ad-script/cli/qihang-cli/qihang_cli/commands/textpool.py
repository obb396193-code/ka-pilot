"""`qihang-cli textpool` 子命令：文案库查询。"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request

from .. import __version__
from .. import constants as c
from ..client import QihangApiError
from ..io_utils import eprint, output_result


DEFAULT_PAGE_SIZE = 100


def register(subparsers, common):
    parser = subparsers.add_parser(
        "textpool",
        help="文案库查询",
        description="查询 CVR 文案库内容（走 dataservice-api）。",
    )
    sub = parser.add_subparsers(dest="textpool_action", required=True, title="动作", metavar="<action>")

    list_p = sub.add_parser(
        "list",
        parents=[common],
        help="查询文案池内容",
        description=(
            "按 poolId 分页查询 CVR 文案池（GET dataservice-api/project/23017/cvr_text_pool）。\n"
            "默认不返回 total；加 --total 可拿 totalNum。"
            "不走 --base-url（固定 dataservice-api 域名）。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli textpool list --pool-id 376\n"
            "  qihang-cli textpool list --pool-id 376 --page 2 --page-size 50"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    list_p.add_argument("--pool-id", required=True, dest="pool_id", help="文案池 ID")
    list_p.add_argument("--page", type=int, default=1, help="页码（默认 1）")
    list_p.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, dest="page_size", help="每页条数（默认 100）")
    list_p.add_argument("--total", action="store_true",
                        help="请求 returnTotalNum=true 以返回 totalNum（默认 false，略快）")
    list_p.set_defaults(func=handle_list)


def _request_textpool(params: dict[str, str], timeout: int = 30) -> dict:
    url = c.TEXT_POOL_BASE_URL.rstrip("/") + c.TEXT_POOL_CVR
    url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": f"qihang-cli/{__version__}"})

    ctx = None
    if os.getenv("PYTHONHTTPSVERIFY") == "0":
        ctx = ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise QihangApiError(f"HTTP {exc.code}: {detail[:500]}", method=c.TEXT_POOL_CVR)
    except urllib.error.URLError as exc:
        raise QihangApiError(f"网络错误: {exc.reason}", method=c.TEXT_POOL_CVR)

    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise QihangApiError(f"响应不是合法 JSON: {raw[:300]}", method=c.TEXT_POOL_CVR)


def handle_list(args, client):
    params = {
        "appCode": c.TEXT_POOL_APP_CODE,
        "returnTotalNum": "true" if args.total else "false",
        "pageNum": str(args.page),
        "pageSize": str(args.page_size),
        "poolId": str(args.pool_id),
    }
    timeout = getattr(client, "timeout", 30) or 30
    result = _request_textpool(params, timeout=timeout)
    output_file = getattr(args, "output_file", None)
    output_result(result, output_file=output_file)
