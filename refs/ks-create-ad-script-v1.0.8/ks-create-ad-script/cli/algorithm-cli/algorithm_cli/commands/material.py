"""`algorithm-cli material` 子命令：算法素材查询。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import output_result
from ._query_common import (
    add_optional_string_flag,
    add_pagination_flags,
    build_base_params,
    merge_optional_params,
)


def register(subparsers, common):
    parser = subparsers.add_parser(
        "material",
        help="算法素材查询",
        description="对接 GET /query/algorithm/material，查询算法侧素材明细。",
    )
    sub = parser.add_subparsers(dest="material_action", required=True, title="动作", metavar="<action>")

    query = sub.add_parser(
        "query",
        parents=[common],
        help="查询算法素材",
        description=(
            "对接 GET /ds-tb-erfangyinliu/project/23017/query/algorithm/material；"
            "走 private-dataservice-api.dw.alibaba-inc.com 域名。"
        ),
        epilog=(
            "示例:\n"
            "  algorithm-cli material query --media KUAISHOU --page-size 20\n"
            "  algorithm-cli material query --media KUAISHOU --signature abc123 \\\n"
            "      --page 1 --page-size 20 --output-file ./materials.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    add_pagination_flags(query, default_page_size=c.DEFAULT_PAGE_SIZE)
    add_optional_string_flag(query, "media", "media", "媒体过滤")
    add_optional_string_flag(query, "signature", "signature", "素材签名过滤")
    add_optional_string_flag(query, "material_code", "material-code", "素材编码过滤")
    add_optional_string_flag(query, "csite", "csite", "版位 csite 过滤")
    add_optional_string_flag(query, "csite_name", "csite-name", "版位名称过滤")
    add_optional_string_flag(query, "material_name", "material-name", "素材名称过滤")
    add_optional_string_flag(query, "material_url", "material-url", "素材 URL 过滤")
    add_optional_string_flag(query, "poster_url", "poster-url", "封面 URL 过滤")
    add_optional_string_flag(query, "resolution", "resolution", "分辨率过滤")
    add_optional_string_flag(query, "material_type", "material-type", "素材类型过滤")
    add_optional_string_flag(query, "video_content_type", "video-content-type", "视频内容类型过滤")
    add_optional_string_flag(
        query,
        "supplier_channelname",
        "supplier-channelname",
        "供应商渠道名过滤",
    )
    add_optional_string_flag(query, "is_aigc", "is-aigc", "是否 AIGC 过滤")
    add_optional_string_flag(query, "is_derivative", "is-derivative", "是否二创过滤")
    add_optional_string_flag(query, "status", "status", "状态过滤")
    add_optional_string_flag(query, "audit_status", "audit-status", "审核状态过滤")
    add_optional_string_flag(query, "item_id", "item-id", "商品 ID 过滤")
    add_optional_string_flag(query, "item_title", "item-title", "商品标题过滤")
    add_optional_string_flag(query, "item_l1catename", "item-l1catename", "商品一级类目过滤")
    add_optional_string_flag(query, "item_catename", "item-catename", "商品类目过滤")
    add_optional_string_flag(query, "gmt_create", "gmt-create", "创建时间过滤")
    add_optional_string_flag(query, "delivery_page_id", "delivery-page-id", "落地页 ID 过滤")
    query.set_defaults(func=handle_query)


def handle_query(args, client):
    params = build_base_params(args, client)
    merge_optional_params(
        params,
        {
            "media": args.media,
            "signature": args.signature,
            "material_code": args.material_code,
            "csite": args.csite,
            "csite_name": args.csite_name,
            "material_name": args.material_name,
            "material_url": args.material_url,
            "poster_url": args.poster_url,
            "resolution": args.resolution,
            "material_type": args.material_type,
            "video_content_type": args.video_content_type,
            "supplier_channelname": args.supplier_channelname,
            "is_aigc": args.is_aigc,
            "is_derivative": args.is_derivative,
            "status": args.status,
            "audit_status": args.audit_status,
            "item_id": args.item_id,
            "item_title": args.item_title,
            "item_l1catename": args.item_l1catename,
            "item_catename": args.item_catename,
            "gmt_create": args.gmt_create,
            "delivery_page_id": args.delivery_page_id,
        },
    )
    result = client.request_get(c.MATERIAL_PATH, params)
    output_result(result, output_file=getattr(args, "output_file", None), fmt=getattr(args, "output", "json"))
