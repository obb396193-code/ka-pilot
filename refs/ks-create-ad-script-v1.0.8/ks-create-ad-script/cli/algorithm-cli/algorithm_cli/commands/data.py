"""`algorithm-cli data` 子命令：动态投放数据查询。"""

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
        "data",
        help="动态投放数据查询",
        description="对接 GET /query/dynamic/data，查询算法动态投放效果数据。",
    )
    sub = parser.add_subparsers(dest="data_action", required=True, title="动作", metavar="<action>")

    query = sub.add_parser(
        "query",
        parents=[common],
        help="查询动态投放数据",
        description=(
            "对接 GET /ds-tb-erfangyinliu/project/23017/query/dynamic/data；"
            "走 private-dataservice-api.dw.alibaba-inc.com 域名。"
        ),
        epilog=(
            "示例:\n"
            "  algorithm-cli data query --ds 20250610\n"
            "  algorithm-cli data query --ds 20250610 --media KUAISHOU --task-id 123 \\\n"
            "      --account-id 108714412 --page 1 --page-size 50 --output-file ./data.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    add_ds_flag(query)
    add_pagination_flags(query, default_page_size=c.DEFAULT_PAGE_SIZE)
    add_optional_string_flag(query, "task_id", "task-id", "任务 ID 过滤")
    add_optional_string_flag(query, "channel_id", "channel-id", "渠道 ID 过滤")
    add_optional_string_flag(query, "channel_name", "channel-name", "渠道名称过滤")
    add_optional_string_flag(query, "channel_type", "channel-type", "渠道类型过滤")
    add_optional_string_flag(query, "task_name", "task-name", "任务名称过滤")
    add_optional_string_flag(query, "task_type", "task-type", "任务类型过滤")
    add_optional_string_flag(query, "account_id", "account-id", "账户 ID 过滤")
    add_optional_string_flag(query, "account_name", "account-name", "账户名称过滤")
    add_optional_string_flag(query, "media", "media", "媒体过滤")
    add_optional_string_flag(query, "bucket_type", "bucket-type", "分桶类型过滤")
    add_optional_string_flag(query, "bucket_id_0", "bucket-id-0", "分桶 ID 0 过滤")
    add_optional_string_flag(query, "bucket_id_1", "bucket-id-1", "分桶 ID 1 过滤")
    add_optional_string_flag(query, "algo_model", "algo-model", "算法模型过滤")
    query.set_defaults(func=handle_query)


def handle_query(args, client):
    params = build_base_params(args, client)
    merge_optional_params(
        params,
        {
            "task_id": args.task_id,
            "channel_id": args.channel_id,
            "channel_name": args.channel_name,
            "channel_type": args.channel_type,
            "task_name": args.task_name,
            "task_type": args.task_type,
            "account_id": args.account_id,
            "account_name": args.account_name,
            "media": args.media,
            "bucket_type": args.bucket_type,
            "bucket_id_0": args.bucket_id_0,
            "bucket_id_1": args.bucket_id_1,
            "algo_model": args.algo_model,
        },
    )
    result = client.request_get(c.DYNAMIC_DATA_PATH, params)
    output_result(result, output_file=getattr(args, "output_file", None), fmt=getattr(args, "output", "json"))
