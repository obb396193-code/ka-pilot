"""`kuaishou-cli native` 子命令。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import output_result
from ..validators import ensure_advertiser_id


def register(subparsers):
    parser = subparsers.add_parser(
        "native",
        help="原生广告相关查询",
        description="查询原生广告授权达人列表。",
    )
    sub = parser.add_subparsers(dest="native_action", required=True, title="动作", metavar="<action>")

    auth_list = sub.add_parser(
        "auth-list",
        help="查询原生授权达人列表",
        description="调用 gw/dsp/v1/native/auth/list 查询账户的原生广告授权达人。",
        epilog="示例:\n  kuaishou-cli native auth-list --advertiser-id 108714412",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    auth_list.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    auth_list.add_argument(
        "--kol-user-type",
        type=int,
        nargs="+",
        default=[1],
        help="达人类型 1=快手达人 2=头条达人（默认 [1]）",
    )
    auth_list.add_argument("--auth-status", type=int, default=None, help="授权状态 1=已授权 2=已取消")
    auth_list.add_argument("--page", type=int, default=1, help="页码（默认 1）")
    auth_list.add_argument("--page-size", type=int, default=20, help="每页条数（默认 20）")
    auth_list.add_argument("--dry-run", action="store_true", help="只打印请求体")
    auth_list.set_defaults(func=handle_auth_list)


def handle_auth_list(args, client):
    payload = {
        "advertiser_id": ensure_advertiser_id(args),
        "kol_user_type": args.kol_user_type,
        "page_info": {
            "current_page": args.page,
            "page_size": args.page_size,
        },
    }
    if args.auth_status is not None:
        payload["auth_status"] = args.auth_status
    output_result(client.request_json(c.NATIVE_AUTH_LIST, payload, dry_run=args.dry_run), args.output)
