"""`qihang-ks-cli kuaishou-task` 子命令：快手任务配置查询。"""

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


def register(subparsers, common):
    parser = subparsers.add_parser(
        "kuaishou-task",
        help="快手任务配置查询",
        description="查询快手投放任务的配置信息（RTA、承接页、返点、扣量参数等）。",
    )
    sub = parser.add_subparsers(dest="kuaishou_task_action", required=True, title="动作", metavar="<action>")

    get_p = sub.add_parser(
        "get",
        parents=[common],
        help="按 task_id 查询任务配置",
        description="按 task_id 查询快手任务的详细配置。",
        epilog=(
            "示例:\n"
            "  qihang-ks-cli kuaishou-task get --task-id 1803240580"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    get_p.add_argument("--task-id", required=True, dest="task_id", help="快手任务 ID")
    get_p.set_defaults(func=handle_get)


def _request_kuaishou_info(params: dict[str, str], timeout: int = 30) -> dict:
    url = c.KUAISHOU_INFO_BASE_URL.rstrip("/") + c.KUAISHOU_INFO_PATH
    url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": f"qihang-ks-cli/{__version__}"},
    )

    ctx = None
    if os.getenv("PYTHONHTTPSVERIFY") == "0":
        ctx = ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise QihangApiError(f"HTTP {exc.code}: {detail[:500]}", method=c.KUAISHOU_INFO_PATH)
    except urllib.error.URLError as exc:
        raise QihangApiError(f"网络错误: {exc.reason}", method=c.KUAISHOU_INFO_PATH)

    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        raise QihangApiError(f"响应不是合法 JSON: {raw[:300]}", method=c.KUAISHOU_INFO_PATH)


def handle_get(args, client):
    params = {
        "appCode": c.KUAISHOU_INFO_APP_CODE,
        "task_id": str(args.task_id),
    }
    timeout = getattr(client, "timeout", 30) or 30
    result = _request_kuaishou_info(params, timeout=timeout)
    output_file = getattr(args, "output_file", None)
    output_result(result, output_file=output_file)
