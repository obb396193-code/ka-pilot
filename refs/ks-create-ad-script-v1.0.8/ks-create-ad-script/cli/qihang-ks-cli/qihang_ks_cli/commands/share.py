"""`qihang-ks-cli share` 子命令：快手素材共享（写接口）。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import CliError, eprint, output_result, print_request_dryrun


def register(subparsers, common):
    parser = subparsers.add_parser(
        "share",
        help="快手素材共享",
        description="把已上传到共享账户的素材推送到目标快手广告账户。",
    )
    sub = parser.add_subparsers(dest="share_action", required=True, title="动作", metavar="<action>")

    mat = sub.add_parser(
        "material",
        parents=[common],
        help="按 signature 列表把素材推送到目标快手账户（写接口）",
        description=(
            "对接 POST /qihang/api/openapi/kuaishou/material/share。\n"
            "写接口会真的把素材推送到目标账户的素材库；不传 --confirm 时强制 dry-run，只打印请求体不实发。\n"
            "返回 data: { photoIdMap: { signature -> photo_id }, failedSignatures: [...] }。"
        ),
        epilog=(
            "示例:\n"
            "  # dry-run（默认）\n"
            "  qihang-ks-cli share material --account-id 108714412 --signatures abc123\n"
            "\n"
            "  # 真发\n"
            "  qihang-ks-cli share material --account-id 108714412 \\\n"
            "      --signatures 5ba4365ef3a0abfee222205001b944fd 44331f99c03ac96636828ccc055eecf4 \\\n"
            "      --confirm"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    mat.add_argument("--account-id", required=True, dest="account_id", help="目标快手广告主账户 id")
    mat.add_argument(
        "--signatures",
        nargs="+",
        required=True,
        help="素材 signature（MD5）列表，空格或多次传",
    )
    mat.add_argument(
        "--confirm",
        action="store_true",
        help="真发；不传时只打印请求体，不实发（写动作安全约束）",
    )
    mat.add_argument("--dry-run", action="store_true", help="（即便加 --confirm 也强制只打印请求体）")
    mat.set_defaults(func=handle_share_material)


def handle_share_material(args, client):
    if not args.signatures:
        raise CliError("--signatures 不能为空")
    payload = {"accountId": args.account_id, "signatures": list(args.signatures)}
    url = client.url_for(c.KUAISHOU_MATERIAL_SHARE)

    # --dry-run 强制；无 --confirm 也走 dry-run
    if args.dry_run or not args.confirm:
        if not args.confirm:
            eprint("写动作未加 --confirm，已转为 dry-run（仅打印请求体不实发）。")
        print_request_dryrun("POST", url, payload)
        return

    result = client.request_json(c.KUAISHOU_MATERIAL_SHARE, payload)
    output_result(result, output_file=args.output_file, fmt=args.output)
