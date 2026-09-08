"""`qihang-ks-cli inventory` 子命令：快手版位查询素材规格。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import output_result, print_request_dryrun


def register(subparsers, common):
    parser = subparsers.add_parser(
        "inventory",
        help="快手版位元数据查询",
        description="快手专属：根据版位查询关联的素材规格（宽高范围 / 中文描述 / 素材类型）。",
    )
    sub = parser.add_subparsers(dest="inventory_action", required=True, title="动作", metavar="<action>")

    spec = sub.add_parser(
        "spec",
        parents=[common],
        help="按版位列表查询支持的素材规格（宽高），多版位按素材规格去重取并集",
        description=(
            "对接 POST /qihang/api/openapi/kuaishou/inventory/material_spec；"
            "纯枚举查询，不打数据库。返回 data 为 List<KuaishouMaterialSpecDTO>，"
            "字段含 mode/desc/materialType/min,maxWidth,Height。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-ks-cli inventory spec --inventory-types KUAI_SHOU_YOU_XUAN\n"
            "  qihang-ks-cli inventory spec --inventory-types KUAI_SHOU_YOU_XUAN OPEN_SCREEN\n"
            "  qihang-ks-cli inventory spec --inventory-types ENCOURAGE_VIDEO --output-file ./spec.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    spec.add_argument(
        "--inventory-types",
        nargs="+",
        required=True,
        choices=c.KUAISHOU_INVENTORY_TYPES,
        dest="inventory_types",
        help=f"快手版位枚举名（多选，候选: {c.KUAISHOU_INVENTORY_TYPES}）",
    )
    spec.add_argument("--dry-run", action="store_true", help="只打印请求体，不发 HTTP")
    spec.set_defaults(func=handle_spec)


def handle_spec(args, client):
    payload = {"inventoryTypes": list(args.inventory_types)}
    if args.dry_run:
        print_request_dryrun("POST", client.url_for(c.KUAISHOU_INVENTORY_MATERIAL_SPEC), payload)
        return
    result = client.request_json(c.KUAISHOU_INVENTORY_MATERIAL_SPEC, payload)
    output_result(result, output_file=args.output_file, fmt=args.output)
