"""`qihang-cli account` 子命令：账户权限查询。"""

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
from ..io_utils import output_result


DEFAULT_PAGE_SIZE = 10


def register(subparsers, common):
    parser = subparsers.add_parser(
        "account",
        help="账户权限查询",
        description="查询账户相关信息（当前仅支持按 userId + 媒体查询有权限账户列表）。",
    )
    sub = parser.add_subparsers(dest="account_action", required=True, title="动作", metavar="<action>")

    list_by_user = sub.add_parser(
        "list-by-user",
        parents=[common],
        help="按 userId + 媒体查询有权限的账户列表",
        description=(
            "对接 GET private-dataservice-api/.../account；"
            "走 private-dataservice-api.dw.alibaba-inc.com 域名（忽略 --base-url）。"
            "返回指定 user 在指定媒体下有权限的 accountId / adSpace 列表，支持分页。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli account list-by-user --media KUAISHOU --user-id 111515362\n"
            "  qihang-cli account list-by-user --media TENCENT --user-id 111515362 \\\n"
            "      --page 1 --page-size 50\n"
            "  qihang-cli account list-by-user --media KUAISHOU --user-id 111515362 \\\n"
            "      --keyword 测试 --biz-name xxx"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    list_by_user.add_argument(
        "--media",
        required=True,
        help="媒体平台（必填，如 KUAISHOU / TENCENT / TOUTIAO 等）",
    )
    list_by_user.add_argument("--user-id", required=True, dest="user_id", help="用户 ID（必填）")
    list_by_user.add_argument("--keyword", default="", help="关键字过滤（可选，默认空）")
    list_by_user.add_argument(
        "--biz-name",
        default="",
        dest="biz_name",
        help="业务名过滤（可选，默认空）",
    )
    list_by_user.add_argument("--page", type=int, default=1, help="页码（默认 1）")
    list_by_user.add_argument(
        "--page-size",
        type=int,
        default=DEFAULT_PAGE_SIZE,
        dest="page_size",
        help=f"每页条数（默认 {DEFAULT_PAGE_SIZE}）",
    )
    list_by_user.add_argument(
        "--no-total",
        action="store_true",
        help="不返回总数（默认返回；不需要 total 时加该 flag 可加速查询）",
    )
    list_by_user.set_defaults(func=handle_list_by_user)


def _request_account_user(params: dict[str, str], timeout: int = 30) -> dict:
    url = c.ACCOUNT_USER_BASE_URL.rstrip("/") + c.ACCOUNT_USER_PATH
    url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": f"qihang-cli/{__version__}"},
    )

    ctx = None
    if os.getenv("PYTHONHTTPSVERIFY") == "0":
        ctx = ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise QihangApiError(f"HTTP {exc.code}: {detail[:500]}", method=c.ACCOUNT_USER_PATH)
    except urllib.error.URLError as exc:
        raise QihangApiError(f"网络错误: {exc.reason}", method=c.ACCOUNT_USER_PATH)

    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        raise QihangApiError(f"响应不是合法 JSON: {raw[:300]}", method=c.ACCOUNT_USER_PATH)


def handle_list_by_user(args, client):
    params = {
        "appCode": c.ACCOUNT_USER_APP_CODE,
        "returnTotalNum": "false" if args.no_total else "true",
        "pageNum": str(args.page),
        "pageSize": str(args.page_size),
        "userId": str(args.user_id),
        "keyword": args.keyword or "",
        "bizName": args.biz_name or "",
        "media": args.media,
    }
    timeout = getattr(client, "timeout", 30) or 30
    result = _request_account_user(params, timeout=timeout)
    output_file = getattr(args, "output_file", None)
    output_result(result, output_file=output_file)
