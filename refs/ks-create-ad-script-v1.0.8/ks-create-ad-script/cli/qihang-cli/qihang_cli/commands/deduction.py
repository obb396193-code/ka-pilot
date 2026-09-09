"""`qihang-cli deduction` 子命令：账户回传扣量查询与修改。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .. import constants as c
from ..client import QihangApiError
from ..io_utils import CliError, eprint, output_result, print_json


# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

# 扣量明细必须恰好 24 条（hour 0-23）
REQUIRED_HOURS = 24
MIN_RATIO = 0
MAX_RATIO = 100


# ---------------------------------------------------------------------------
# 子命令注册
# ---------------------------------------------------------------------------

def register(subparsers, common):
    parser = subparsers.add_parser(
        "deduction",
        help="账户回传扣量查询与修改",
        description=(
            "调用启航账户回传扣量接口。\n"
            "  list    查询单账户回传扣量配置（GET）\n"
            "  update  批量修改账户回传扣量配置（POST，支持多账户）\n"
            "走 qh.alibaba-inc.com（受 --base-url 影响）。appKey 已内置，无需传入。"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(
        dest="deduction_action", required=True, title="动作", metavar="<action>"
    )

    # ---- list ----
    list_parser = sub.add_parser(
        "list",
        parents=[common],
        help="查询单账户回传扣量配置",
        description=(
            "对接 GET /qihang/api/rta_auto/tmp/callback_deduction/list。\n"
            "查询结果为空时统一返回扣量 0 的标准化响应。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli deduction list --media KUAISHOU --account-id 108714412\n"
            "  qihang-cli deduction list --media TENCENT --account-id 123456 \\\n"
            "      --output-file tmp/deduction.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    list_parser.add_argument(
        "--media", required=True, help="媒体平台（如 KUAISHOU / TENCENT / TOUTIAO 等）"
    )
    list_parser.add_argument(
        "--account-id",
        required=True,
        dest="account_id",
        help="广告主账户 ID（单个）",
    )
    list_parser.set_defaults(func=handle_list)

    # ---- update ----
    update_parser = sub.add_parser(
        "update",
        parents=[common],
        help="批量修改账户回传扣量配置",
        description=(
            "对接 POST /qihang/api/rta_auto/tmp/callback_deduction。\n"
            "支持多账户（--account-ids 逗号分隔），对全部账户应用相同的 24 小时扣量配置。\n"
            "扣量比例可通过 --ratio 统一设定（24 小时相同），或通过 --input 从 JSON 文件逐小时指定。"
        ),
        epilog=(
            "示例:\n"
            "  # 统一扣量 30%（24 小时均为 30）\n"
            "  qihang-cli deduction update --media KUAISHOU \\\n"
            "      --account-ids 108714412,108714413 --ratio 30\n"
            "\n"
            "  # 逐小时扣量（从 JSON 文件读取）\n"
            "  qihang-cli deduction update --media KUAISHOU \\\n"
            "      --account-ids 108714412 --input tmp/deduction_detail.json\n"
            "\n"
            "  # 清零扣量\n"
            "  qihang-cli deduction update --media KUAISHOU \\\n"
            "      --account-ids 108714412 --ratio 0\n"
            "\n"
            "input 文件格式（JSON 数组，必须 24 条，hour 0-23）:\n"
            '  [{"hour": 0, "deductionRatio": 10}, {"hour": 1, "deductionRatio": 20}, ...]'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    update_parser.add_argument(
        "--media", required=True, help="媒体平台（如 KUAISHOU / TENCENT / TOUTIAO 等）"
    )
    update_parser.add_argument(
        "--account-ids",
        required=True,
        dest="account_ids",
        help="广告主账户 ID（多个用逗号分隔，如 108714412,108714413）",
    )
    # 扣量来源：--ratio 或 --input，二选一
    ratio_group = update_parser.add_mutually_exclusive_group(required=True)
    ratio_group.add_argument(
        "--ratio",
        type=int,
        help=f"统一扣量比例 0-100（24 小时均设为此值）",
    )
    ratio_group.add_argument(
        "--input",
        dest="input_file",
        help=(
            "扣量明细 JSON 文件路径（数组格式，必须 24 条，"
            '每条为 {"hour": 0-23, "deductionRatio": 0-100}）'
        ),
    )
    update_parser.add_argument("--dry-run", action="store_true", help="只构造请求体，不实际发请求")
    update_parser.set_defaults(func=handle_update)


# ---------------------------------------------------------------------------
# 响应解析
# ---------------------------------------------------------------------------

def _unwrap_response(parsed: dict) -> dict:
    """解析启航响应，校验 successful/code，返回完整 dict。"""
    successful = parsed.get("successful")
    code = parsed.get("code")
    if successful is False:
        msg = parsed.get("message") or parsed.get("msg") or ""
        if not msg:
            msg = f"服务端未返回错误信息，完整响应: {json.dumps(parsed, ensure_ascii=False, default=str)}"
        raise QihangApiError(f"接口业务失败 successful=false code={code!r} message={msg}")
    if successful is None and code not in (None, 0, "", "0"):
        msg = parsed.get("message") or parsed.get("msg") or ""
        if not msg:
            msg = f"服务端未返回错误信息，完整响应: {json.dumps(parsed, ensure_ascii=False, default=str)}"
        raise QihangApiError(f"接口业务失败 code={code!r} message={msg}")
    return parsed


# ---------------------------------------------------------------------------
# 空结果归一化
# ---------------------------------------------------------------------------

def _normalize_empty_result(media: str, account_id: str) -> dict[str, Any]:
    """查询结果为空时，构造扣量 0 的标准化响应。"""
    return {
        "successful": True,
        "code": 0,
        "message": "查询结果为空，扣量默认为 0",
        "data": [
            {
                "media": media,
                "accountId": account_id,
                "deductionRatio": 0,
                "deductionDetailList": [
                    {"hour": h, "deductionRatio": 0} for h in range(REQUIRED_HOURS)
                ],
                "deductionJson": None,
                "note": "原始查询结果为空，此为归一化后的默认扣量 0 配置",
            }
        ],
    }


def _normalize_data_entries(data: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """归一化数据条目：deductionRatio=null → 0，deductionDetailList=null → 全 0 明细。"""
    for entry in data:
        if entry.get("deductionRatio") is None:
            entry["deductionRatio"] = 0
            entry["note"] = "原始扣量为空，归一化为 0"
        if entry.get("deductionDetailList") is None:
            entry["deductionDetailList"] = [
                {"hour": h, "deductionRatio": 0} for h in range(REQUIRED_HOURS)
            ]
    return data


# ---------------------------------------------------------------------------
# 扣量明细构造与校验
# ---------------------------------------------------------------------------

def _build_detail_list_from_ratio(ratio: int) -> list[dict[str, int]]:
    """根据统一比例生成 24 小时扣量明细。"""
    return [{"hour": h, "deductionRatio": ratio} for h in range(REQUIRED_HOURS)]


def _load_detail_list_from_file(path: str) -> list[dict[str, Any]]:
    """从 JSON 文件加载扣量明细列表。"""
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists():
        raise CliError(f"输入文件不存在: {file_path}")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise CliError(f"输入文件 JSON 解析失败: {exc}")

    if not isinstance(data, list):
        raise CliError(f"输入文件内容必须是 JSON 数组，收到: {type(data).__name__}")
    return data


def _validate_detail_list(detail_list: list[dict[str, Any]]) -> None:
    """校验扣量明细列表：必须 24 条，hour 0-23 不重复，ratio 0-100。"""
    if len(detail_list) != REQUIRED_HOURS:
        raise CliError(
            f"扣量明细必须恰好 {REQUIRED_HOURS} 条（hour 0-23），当前 {len(detail_list)} 条"
        )

    hours_seen = set()
    for i, item in enumerate(detail_list):
        hour = item.get("hour")
        ratio = item.get("deductionRatio")

        if hour is None or not isinstance(hour, int):
            raise CliError(f"第 {i} 条明细 hour 字段缺失或非整数: {hour!r}")
        if hour < 0 or hour > 23:
            raise CliError(f"第 {i} 条明细 hour 超范围（0-23）: {hour}")
        if hour in hours_seen:
            raise CliError(f"第 {i} 条明细 hour={hour} 重复")
        hours_seen.add(hour)

        if ratio is None or not isinstance(ratio, (int, float)):
            raise CliError(f"第 {i} 条明细 deductionRatio 字段缺失或非数值: {ratio!r}")
        if ratio < MIN_RATIO or ratio > MAX_RATIO:
            raise CliError(f"第 {i} 条明细 deductionRatio 超范围（{MIN_RATIO}-{MAX_RATIO}）: {ratio}")


# ---------------------------------------------------------------------------
# handler
# ---------------------------------------------------------------------------

def handle_list(args, client):
    """查询账户回传扣量配置。"""
    media = args.media
    account_id = args.account_id

    params = {
        "appKey": c.DEDUCTION_APP_KEY,
        "media": media,
        "accountId": account_id,
    }

    eprint(f"查询账户扣量: media={media}, accountId={account_id} ...")

    raw = client.request_get(c.DEDUCTION_LIST_PATH, params)
    parsed = _unwrap_response(raw)

    data = parsed.get("data")
    if not data:  # None 或空列表
        eprint("查询结果为空，归一化为扣量 0")
        result = _normalize_empty_result(media, account_id)
    else:
        # 归一化：deductionRatio=null → 0，deductionDetailList=null → 全 0 明细
        null_count = sum(1 for d in data if d.get("deductionRatio") is None)
        if null_count > 0:
            eprint(f"{null_count} 条记录扣量为空，归一化为 0")
        parsed["data"] = _normalize_data_entries(data)
        result = parsed

    output_file = getattr(args, "output_file", None)
    output_result(result, output_file=output_file)


def handle_update(args, client):
    """批量修改账户回传扣量配置。"""
    media = args.media

    # 解析多账户（逗号分隔）
    account_ids = [aid.strip() for aid in args.account_ids.split(",") if aid.strip()]
    if not account_ids:
        raise CliError("--account-ids 不能为空")

    # 构造扣量明细
    if args.ratio is not None:
        if args.ratio < MIN_RATIO or args.ratio > MAX_RATIO:
            raise CliError(f"--ratio 超范围（{MIN_RATIO}-{MAX_RATIO}）: {args.ratio}")
        detail_list = _build_detail_list_from_ratio(args.ratio)
        eprint(f"统一扣量模式: ratio={args.ratio}%（24 小时均设为此值）")
    else:
        detail_list = _load_detail_list_from_file(args.input_file)
        eprint(f"文件扣量模式: 从 {args.input_file} 加载 {len(detail_list)} 条明细")

    # CLI 侧预校验
    _validate_detail_list(detail_list)

    # 构造请求体
    payload: dict[str, Any] = {
        "media": media,
        "accountIds": account_ids,
        "deductionDetailList": detail_list,
    }

    params = {
        "appKey": c.DEDUCTION_APP_KEY,
    }

    if args.dry_run:
        print_json(
            {
                "dryRun": True,
                "method": "POST",
                "url": client.url_for(c.DEDUCTION_UPDATE_PATH),
                "params": params,
                "body": payload,
            }
        )
        return

    eprint(
        f"修改账户扣量: media={media}, accountIds={account_ids}, "
        f"detailCount={len(detail_list)} ..."
    )

    raw = client.request_post_with_params(c.DEDUCTION_UPDATE_PATH, params, payload)
    result = _unwrap_response(raw)

    if result.get("successful"):
        eprint(f"修改成功! 影响账户数: {len(account_ids)}")

    output_file = getattr(args, "output_file", None)
    output_result(result, output_file=output_file)
