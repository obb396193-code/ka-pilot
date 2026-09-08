"""`algorithm-cli info` 子命令：动态出价信息查询。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import output_result
from ._query_common import (
    add_ds_flag,
    add_optional_string_flag,
    add_pagination_flags,
    build_base_params,
    merge_optional_params,
)


def register(subparsers, common):
    parser = subparsers.add_parser(
        "info",
        help="动态出价信息查询",
        description="对接 GET /query/dynamic/bid/info，查询算法动态出价配置。",
    )
    sub = parser.add_subparsers(dest="info_action", required=True, title="动作", metavar="<action>")

    query = sub.add_parser(
        "query",
        parents=[common],
        help="查询动态出价信息",
        description=(
            "对接 GET /ds-tb-erfangyinliu/project/23017/query/dynamic/bid/info；"
            "走 private-dataservice-api.dw.alibaba-inc.com 域名。"
        ),
        epilog=(
            "示例:\n"
            "  algorithm-cli info query --ds 20250610\n"
            "  algorithm-cli info query --ds 20250610 --task-id 123 --media-id ks \\\n"
            "      --page 1 --page-size 50 --output-file ./info.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    add_ds_flag(query)
    add_pagination_flags(query, default_page_size=c.DEFAULT_PAGE_SIZE)
    add_optional_string_flag(query, "task_id", "task-id", "任务 ID 过滤")
    add_optional_string_flag(query, "channel_id", "channel-id", "渠道 ID 过滤")
    add_optional_string_flag(query, "media_id", "media-id", "媒体 ID 过滤")
    add_optional_string_flag(query, "task_name", "task-name", "任务名称过滤")
    add_optional_string_flag(query, "bid_status", "bid-status", "出价状态过滤")
    add_optional_string_flag(query, "exp_group", "exp-group", "实验组过滤")
    add_optional_string_flag(query, "exp_rate", "exp-rate", "实验比例过滤")
    query.set_defaults(func=handle_query)


def handle_query(args, client):
    params = build_base_params(args, client)
    merge_optional_params(
        params,
        {
            "task_id": args.task_id,
            "channel_id": args.channel_id,
            "media_id": args.media_id,
            "task_name": args.task_name,
            "bid_status": args.bid_status,
            "exp_group": args.exp_group,
            "exp_rate": args.exp_rate,
        },
    )
    result = client.request_get(c.BID_INFO_PATH, params)
    output_result(result, output_file=getattr(args, "output_file", None), fmt=getattr(args, "output", "json"))
