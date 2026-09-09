"""`qihang-cli signature` 子命令：素材签名使用次数查询。

后端接口（GET，走 dataservice-api 域名）：
  https://dataservice-api.dw.alibaba-inc.com/project/23017/get_media_signature_usage
传入 media + signature，返回该签名的使用次数；查不到时使用次数归一化为 0。
使用次数的实际含义：有曝光的素材被多少个有曝光的创意使用。
"""

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
from ..io_utils import CliError, output_result


def register(subparsers, common):
    parser = subparsers.add_parser(
        "signature",
        help="素材签名使用次数查询",
        description="查询指定媒体下某素材签名的使用次数（走 dataservice-api）。",
    )
    sub = parser.add_subparsers(
        dest="signature_action", required=True, title="动作", metavar="<action>"
    )

    usage_p = sub.add_parser(
        "usage",
        parents=[common],
        help="查询素材签名使用次数",
        description=(
            "对接 GET dataservice-api/project/23017/get_media_signature_usage。\n"
            "传入媒体 + 签名，返回该签名被使用的次数；查不到返回 usageCount=0。\n"
            "usageCount 实际含义：有曝光的素材被多少个有曝光的创意使用。\n"
            "不走 --base-url（固定 dataservice-api 域名）。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli signature usage --media TENCENT \\\n"
            "      --signature 0008e800b186478cc167ed1ff1ab3d13"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    usage_p.add_argument(
        "--media", required=True, help="媒体枚举名（如 TENCENT / KUAISHOU / TOUTIAO 等）"
    )
    usage_p.add_argument("--signature", required=True, help="素材签名（signature 值）")
    usage_p.add_argument("--dry-run", action="store_true", help="只打印请求 URL，不发 HTTP")
    usage_p.set_defaults(func=handle_usage)


def _signature_usage_url(params: dict[str, str]) -> str:
    url = c.SIGNATURE_USAGE_BASE_URL.rstrip("/") + c.SIGNATURE_USAGE_PATH
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return url


def _request_signature_usage(params: dict[str, str], timeout: int = 30) -> dict:
    """GET 请求 dataservice-api 签名使用次数接口。"""
    url = _signature_usage_url(params)
    req = urllib.request.Request(
        url, method="GET", headers={"User-Agent": f"qihang-cli/{__version__}"}
    )

    ctx = None
    if os.getenv("PYTHONHTTPSVERIFY") == "0":
        ctx = ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise QihangApiError(f"HTTP {exc.code}: {detail[:500]}", method=c.SIGNATURE_USAGE_PATH)
    except urllib.error.URLError as exc:
        raise QihangApiError(f"网络错误: {exc.reason}", method=c.SIGNATURE_USAGE_PATH)

    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise QihangApiError(f"响应不是合法 JSON: {raw[:300]}", method=c.SIGNATURE_USAGE_PATH)


def handle_usage(args, client):
    params = {
        "appCode": c.SIGNATURE_USAGE_APP_CODE,
        "media": args.media,
        "signature": args.signature,
    }

    if args.dry_run:
        from ..io_utils import print_request_dryrun

        print_request_dryrun("GET", _signature_usage_url(params), {})
        return

    timeout = getattr(client, "timeout", 30) or 30
    resp = _request_signature_usage(params, timeout=timeout)

    if resp.get("errCode") != 0:
        raise CliError(f"API 错误: {resp.get('errMsg', 'unknown')}")

    data = resp.get("data") or []
    usage_count = data[0].get("usage_count", 0) if data else 0

    result = {
        "successful": True,
        "media": args.media,
        "signature": args.signature,
        "usageCount": usage_count,
    }
    output_result(result, output_file=getattr(args, "output_file", None), fmt=args.output)
