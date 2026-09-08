"""`kuaishou-cli campaign` 子命令：广告计划。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import output_result, read_json_file
from ..validators import ensure_advertiser_id, merge_advertiser_id, validate_campaign_create


def register(subparsers):
    parser = subparsers.add_parser(
        "campaign",
        help="广告计划（一级）查询和创建",
        description="查询/创建广告计划。",
    )
    sub = parser.add_subparsers(dest="campaign_action", required=True, title="动作", metavar="<action>")

    list_p = sub.add_parser(
        "list",
        help="按条件分页查询计划",
        description="分页查询计划。",
        epilog="示例:\n  kuaishou-cli campaign list --page 1 --page-size 20",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    list_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    list_p.add_argument("--campaign-name", help="按计划名模糊匹配")
    list_p.add_argument("--status", type=int, help="按计划状态过滤")
    list_p.add_argument("--campaign-type", type=int, help="按计划类型过滤")
    list_p.add_argument("--page", type=int, default=1, help="页码")
    list_p.add_argument("--page-size", type=int, default=c.DEFAULT_PAGE_SIZE, help="每页条数")
    list_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    list_p.set_defaults(func=handle_list)

    get_p = sub.add_parser("get", help="按 campaign_id 查询单个计划", description="查询指定计划。")
    get_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    get_p.add_argument("--campaign-id", required=True, help="campaign_id")
    get_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    get_p.set_defaults(func=handle_get)

    create_p = sub.add_parser(
        "create",
        help="创建新计划（payload 来自 JSON 文件）",
        description="从 JSON 文件创建计划。",
        epilog="示例:\n  kuaishou-cli campaign create -f campaign.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    create_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    create_p.add_argument("--input", "-f", required=True, help="计划 payload JSON 文件路径")
    create_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    create_p.set_defaults(func=handle_create)


def handle_list(args, client):
    payload = {"advertiser_id": ensure_advertiser_id(args), "page": args.page, "page_size": args.page_size}
    if args.campaign_name:
        payload["campaign_name"] = args.campaign_name
    if args.status is not None:
        payload["status"] = args.status
    if args.campaign_type is not None:
        payload["campaign_type"] = args.campaign_type
    output_result(client.request_json(c.CAMPAIGN_LIST, payload, dry_run=args.dry_run), args.output)


def handle_get(args, client):
    payload = {"advertiser_id": ensure_advertiser_id(args), "campaign_id": args.campaign_id, "page": 1, "page_size": 1}
    output_result(client.request_json(c.CAMPAIGN_LIST, payload, dry_run=args.dry_run), args.output)


def handle_create(args, client):
    payload = merge_advertiser_id(args, read_json_file(args.input))
    payload = validate_campaign_create(payload)
    output_result(client.request_json(c.CAMPAIGN_CREATE, payload, dry_run=args.dry_run), args.output)
