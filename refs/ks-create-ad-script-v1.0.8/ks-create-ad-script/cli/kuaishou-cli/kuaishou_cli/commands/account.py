"""`kuaishou-cli account` 子命令。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import output_result
from ..validators import ensure_advertiser_id


def register(subparsers):
    parser = subparsers.add_parser(
        "account",
        help="广告主基础信息、余额、预算、流水查询",
        description="查询广告主资质、账户余额、日预算和账户流水。",
    )
    sub = parser.add_subparsers(dest="account_action", required=True, title="动作", metavar="<action>")

    for name, help_text, handler in [
        ("info", "广告主资质信息", handle_info),
        ("fund", "账户余额", handle_fund),
        ("budget", "账户日预算", handle_budget),
    ]:
        sp = sub.add_parser(name, help=help_text, description=help_text)
        sp.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
        sp.add_argument("--dry-run", action="store_true", help="只打印请求体")
        sp.set_defaults(func=handler)

    flows = sub.add_parser(
        "flows",
        help="账户每日资金流水",
        description="按日期范围拉取账户资金流水。",
        epilog="示例:\n  kuaishou-cli account flows --start 2026-04-25 --end 2026-04-30",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    flows.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    flows.add_argument("--start", required=True, help="起始日期 YYYY-MM-DD")
    flows.add_argument("--end", required=True, help="结束日期 YYYY-MM-DD")
    flows.add_argument("--dry-run", action="store_true", help="只打印请求体")
    flows.set_defaults(func=handle_flows)

    update_budget = sub.add_parser(
        "update-budget",
        help="修改账户日预算（单位：元）",
        description=(
            "修改账户日预算。--day-budget 单位为元，CLI 内部 ×1000 转厘后调用 "
            "/v1/advertiser/update/budget。0 表示预算不限；非 0 时需 ≥500 元，≤1 亿元；"
            "且不得低于当日花费的 120%（媒体侧约束）。"
        ),
        epilog="示例:\n  kuaishou-cli account update-budget --advertiser-id 108714412 --day-budget 3000",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    update_budget.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    update_budget.add_argument(
        "--day-budget",
        required=True,
        type=float,
        help="单日预算金额（元），0 表示不限；非 0 时 ≥500 元 ≤1 亿元",
    )
    update_budget.add_argument("--dry-run", action="store_true", help="只打印请求体")
    update_budget.set_defaults(func=handle_update_budget)


def _payload(args):
    return {"advertiser_id": ensure_advertiser_id(args)}


def handle_info(args, client):
    output_result(client.request_json(c.ADVERTISER_INFO, _payload(args), dry_run=args.dry_run), args.output)


def handle_fund(args, client):
    output_result(client.request_json(c.ADVERTISER_FUND_GET, _payload(args), dry_run=args.dry_run), args.output)


def handle_budget(args, client):
    output_result(client.request_json(c.ADVERTISER_BUDGET_GET, _payload(args), dry_run=args.dry_run), args.output)


def handle_flows(args, client):
    payload = _payload(args)
    payload.update({"start_date": args.start, "end_date": args.end})
    output_result(client.request_json(c.ADVERTISER_FLOWS, payload, dry_run=args.dry_run), args.output)


def handle_update_budget(args, client):
    yuan = float(args.day_budget)
    if yuan < 0:
        raise SystemExit("--day-budget 不能为负数")
    if yuan != 0 and (yuan < 500 or yuan > 100_000_000):
        raise SystemExit("--day-budget 非 0 时必须在 [500, 100000000] 元之间")
    day_budget_li = int(round(yuan * 1000))
    payload = {
        "advertiser_id": int(ensure_advertiser_id(args)),
        "day_budget": day_budget_li,
    }
    output_result(client.request_json(c.ADVERTISER_BUDGET_UPDATE, payload, dry_run=args.dry_run), args.output)
