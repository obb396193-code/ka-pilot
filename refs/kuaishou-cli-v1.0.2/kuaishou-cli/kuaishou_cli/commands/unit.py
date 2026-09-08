"""`kuaishou-cli unit` 子命令：广告组。"""

from __future__ import annotations

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

from .. import constants as c
from ..io_utils import eprint, output_result, read_json_file
from ..validators import (
    build_schedule_time,
    ensure_advertiser_id,
    merge_advertiser_id,
    schedule_presets,
    validate_bid_yuan,
    validate_unit_create,
)


def register(subparsers):
    parser = subparsers.add_parser(
        "unit",
        help="广告组（二级）查询和创建",
        description="查询/创建广告组。",
    )
    sub = parser.add_subparsers(dest="unit_action", required=True, title="动作", metavar="<action>")

    list_p = sub.add_parser(
        "list",
        help="按条件分页查询广告组",
        description="分页查询广告组。",
        epilog="示例:\n  kuaishou-cli unit list --campaign-id 9101981361",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    list_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    list_p.add_argument("--campaign-id", help="按所属计划过滤")
    list_p.add_argument("--unit-name", help="按广告组名模糊匹配")
    list_p.add_argument("--status", type=int, help="按广告组状态过滤")
    list_p.add_argument("--page", type=int, default=1, help="页码")
    list_p.add_argument("--page-size", type=int, default=c.DEFAULT_PAGE_SIZE, help="每页条数")
    list_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    list_p.set_defaults(func=handle_list)

    get_p = sub.add_parser("get", help="按 unit_id 查询单个广告组", description="查询指定广告组。")
    get_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    get_p.add_argument("--unit-id", required=True, help="unit_id")
    get_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    get_p.set_defaults(func=handle_get)

    create_p = sub.add_parser(
        "create",
        help="创建新广告组（payload 来自 JSON 文件）",
        description="从 JSON 文件创建广告组。",
        epilog="示例:\n  kuaishou-cli unit create -f unit.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    create_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    create_p.add_argument("--input", "-f", required=True, help="广告组 payload JSON 文件路径")
    create_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    create_p.set_defaults(func=handle_create)

    online_p = sub.add_parser(
        "online",
        help="批量上线（投放）广告组，put_status=1",
        description="批量将广告组状态改为投放中（put_status=1）。单批最多 10 个 unit_id，超出自动切批。",
        epilog="示例:\n  kuaishou-cli unit online --advertiser-id 108714412 --unit-ids 1,2,3",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    online_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    online_p.add_argument("--unit-ids", required=True, help="逗号分隔的 unit_id 列表，单批 ≤10，超出自动分批")
    online_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    online_p.set_defaults(func=handle_online)

    offline_p = sub.add_parser(
        "offline",
        help="批量下线（暂停）广告组，put_status=2",
        description="批量将广告组状态改为暂停（put_status=2）。单批最多 10 个 unit_id，超出自动切批。",
        epilog="示例:\n  kuaishou-cli unit offline --advertiser-id 108714412 --unit-ids 1,2,3",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    offline_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    offline_p.add_argument("--unit-ids", required=True, help="逗号分隔的 unit_id 列表，单批 ≤10，超出自动分批")
    offline_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    offline_p.set_defaults(func=handle_offline)

    bid_p = sub.add_parser(
        "update-bid",
        help="批量修改广告组出价（单位：元，单批 ≤50）",
        description=(
            "批量修改广告组出价。--bid 单位为元，CLI 内部 ×1000 转厘后调用 "
            "/v1/ad_unit/update/bid。单批最多 50 个 unit_id，超出自动切批。"
        ),
        epilog="示例:\n  kuaishou-cli unit update-bid --advertiser-id 108714412 --unit-ids 1,2,3 --bid 0.5",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    bid_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    bid_p.add_argument("--unit-ids", required=True, help="逗号分隔的 unit_id 列表，单批 ≤50，超出自动分批")
    bid_p.add_argument("--bid", required=True, type=float, help="出价金额（元），CPC/eCPC 0.2~100；OCPC 行为出价 ≥1，激活出价 ≥5（白名单 ≥2）")
    bid_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    bid_p.set_defaults(func=handle_update_bid)

    schedule_p = sub.add_parser(
        "update-schedule",
        help="批量修改广告组投放时段（schedule_time，168 位 0/1 串）",
        description=(
            "批量修改广告组投放时段。底层调 gw/dsp/unit/update，每个 unit_id 单独一次请求，"
            "遇错跳过继续，结果数组中明确标注每个 unit 的成功/失败。\n"
            "schedule_time 为 168 位 0/1 字符串，1 小时为最小粒度，"
            "第 1 位 = 周一 00:00-01:00，第 168 位 = 周日 23:00-24:00。"
        ),
        epilog=(
            "示例:\n"
            "  # 直接指定 unit + 预设时段\n"
            "  kuaishou-cli unit update-schedule --unit-ids 1,2,3 --preset workday_9_22\n"
            "  # 账户下全部广告组 + 自定义时段\n"
            "  kuaishou-cli unit update-schedule --all --days mon,tue,wed,thu,fri --from 9 --to 22\n"
            "  # 直传 168 位串\n"
            "  kuaishou-cli unit update-schedule --unit-ids 1 --schedule-time 111...0\n"
            "  # 先 dry-run 看 payload 和受影响 unit\n"
            "  kuaishou-cli unit update-schedule --all --preset all_day --dry-run"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    schedule_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    scope = schedule_p.add_mutually_exclusive_group(required=True)
    scope.add_argument("--unit-ids", help="逗号分隔的 unit_id 列表")
    scope.add_argument(
        "--all",
        action="store_true",
        dest="all_units",
        help="账户下所有广告组（先调 unit/list 翻页拉全）",
    )
    schedule_p.add_argument(
        "--schedule-time",
        dest="schedule_time",
        help="直传 168 位 0/1 字符串（与 --preset、--days 互斥）",
    )
    schedule_p.add_argument(
        "--preset",
        choices=schedule_presets(),
        help=f"内置预设时段（可选: {', '.join(schedule_presets())}）",
    )
    schedule_p.add_argument(
        "--days",
        help="投放日，逗号分隔: mon,tue,wed,thu,fri,sat,sun（与 --from/--to 配合）",
    )
    schedule_p.add_argument("--from", dest="from_h", type=int, help="开始小时 0-23（含）")
    schedule_p.add_argument("--to", dest="to_h", type=int, help="结束小时 1-24（不含）")
    schedule_p.add_argument("--concurrency", type=int, default=5, help="并发线程数（默认 5）")
    schedule_p.add_argument("--dry-run", action="store_true", help="只打印请求体，不下发")
    schedule_p.set_defaults(func=handle_update_schedule)


def handle_list(args, client):
    payload = {"advertiser_id": ensure_advertiser_id(args), "page": args.page, "page_size": args.page_size}
    if args.campaign_id:
        payload["campaign_id"] = args.campaign_id
    if args.unit_name:
        payload["unit_name"] = args.unit_name
    if args.status is not None:
        payload["status"] = args.status
    output_result(client.request_json(c.UNIT_LIST, payload, dry_run=args.dry_run), args.output)


def handle_get(args, client):
    payload = {"advertiser_id": ensure_advertiser_id(args), "unit_ids": [args.unit_id], "page": 1, "page_size": 1}
    output_result(client.request_json(c.UNIT_LIST, payload, dry_run=args.dry_run), args.output)


def handle_create(args, client):
    payload = merge_advertiser_id(args, read_json_file(args.input))
    payload = validate_unit_create(payload)
    output_result(client.request_json(c.UNIT_CREATE, payload, dry_run=args.dry_run), args.output)


def _update_unit_status(args, client, put_status: int):
    advertiser_id = int(ensure_advertiser_id(args))
    raw = [x.strip() for x in args.unit_ids.split(",") if x.strip()]
    if not raw:
        raise SystemExit("--unit-ids 不能为空")
    try:
        ids = [int(x) for x in raw]
    except ValueError as exc:
        raise SystemExit(f"--unit-ids 必须全部为数字: {exc}")
    seen, unique = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            unique.append(i)
    BATCH = 10
    batches = [unique[i:i + BATCH] for i in range(0, len(unique), BATCH)]
    results = []
    for batch in batches:
        payload = {"advertiser_id": advertiser_id, "unit_ids": batch, "put_status": put_status}
        try:
            resp = client.request_json(c.UNIT_UPDATE_STATUS, payload, dry_run=args.dry_run)
            results.append({"batch": batch, "ok": True, "response": resp})
        except Exception as exc:
            results.append({"batch": batch, "ok": False, "error": str(exc)})
    output_result(results, args.output)


def handle_online(args, client):
    _update_unit_status(args, client, put_status=1)


def handle_offline(args, client):
    _update_unit_status(args, client, put_status=2)


def _fetch_all_unit_ids(client, advertiser_id: int, dry_run: bool) -> list[int]:
    """翻页拉账户下所有 unit_id。dry_run 模式返回占位列表，仅用于打印示例 payload。"""
    if dry_run:
        return [0]
    page = 1
    page_size = c.DEFAULT_PAGE_SIZE
    seen: set[int] = set()
    ordered: list[int] = []
    while True:
        payload = {"advertiser_id": advertiser_id, "page": page, "page_size": page_size}
        resp = client.request_json(c.UNIT_LIST, payload)
        data = resp.get("data") or {}
        rows = data.get("details") or data.get("data") or data.get("list") or []
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            uid = row.get("unit_id") if isinstance(row, dict) else None
            if uid is None:
                continue
            try:
                uid_int = int(uid)
            except (TypeError, ValueError):
                continue
            if uid_int not in seen:
                seen.add(uid_int)
                ordered.append(uid_int)
        if len(rows) < page_size:
            break
        page += 1
    return ordered


def _progress_line(done: int, total: int, success: int, failure: int) -> str:
    pct = done * 100 // total if total else 0
    bar_len = 20
    filled = bar_len * done // total if total else 0
    bar = "█" * filled + "░" * (bar_len - filled)
    return f"\r  {bar} {done}/{total} ({pct}%) ✓{success} ✗{failure}"


def handle_update_schedule(args, client):
    advertiser_id = int(ensure_advertiser_id(args))
    schedule_time = build_schedule_time(
        raw=args.schedule_time,
        preset=args.preset,
        days=args.days,
        from_h=args.from_h,
        to_h=args.to_h,
    )

    if args.all_units:
        unit_ids = _fetch_all_unit_ids(client, advertiser_id, dry_run=args.dry_run)
        if not unit_ids:
            raise SystemExit("账户下未查询到任何广告组")
    else:
        raw = [x.strip() for x in (args.unit_ids or "").split(",") if x.strip()]
        if not raw:
            raise SystemExit("--unit-ids 不能为空")
        try:
            ids = [int(x) for x in raw]
        except ValueError as exc:
            raise SystemExit(f"--unit-ids 必须全部为数字: {exc}")
        seen, unit_ids = set(), []
        for i in ids:
            if i not in seen:
                seen.add(i)
                unit_ids.append(i)

    total = len(unit_ids)
    concurrency = max(1, min(args.concurrency, 20))
    results = [None] * total
    lock = threading.Lock()
    done = 0
    success = 0
    failure = 0
    is_tty = sys.stderr.isatty()

    eprint(f"开始修改 {total} 个广告组的投放时段（并发={concurrency}）...")

    def update_one(idx: int, uid: int) -> dict:
        payload = {
            "advertiser_id": advertiser_id,
            "unit_id": uid,
            "schedule_time": schedule_time,
        }
        try:
            resp = client.request_json(c.UNIT_UPDATE, payload, dry_run=args.dry_run)
            return {"unit_id": uid, "ok": True, "response": resp}
        except Exception as exc:
            return {"unit_id": uid, "ok": False, "error": str(exc)}

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(update_one, i, uid): i for i, uid in enumerate(unit_ids)}
        for future in as_completed(futures):
            idx = futures[future]
            result = future.result()
            results[idx] = result
            with lock:
                done += 1
                if result["ok"]:
                    success += 1
                else:
                    failure += 1
                if is_tty:
                    sys.stderr.write(_progress_line(done, total, success, failure))
                    sys.stderr.flush()
                elif done % 50 == 0 or done == total:
                    eprint(f"  进度: {done}/{total} 成功={success} 失败={failure}")

    if is_tty:
        sys.stderr.write("\n")

    summary = {
        "schedule_time": schedule_time,
        "total": total,
        "success": success,
        "failure": failure,
        "failed_unit_ids": [r["unit_id"] for r in results if not r["ok"]],
        "results": results,
    }
    output_result(summary, args.output)
    eprint(f"汇总: 总数 {total}, 成功 {success}, 失败 {failure}")
    if failure > 0 and not args.dry_run:
        raise SystemExit(1)


def handle_update_bid(args, client):
    advertiser_id = int(ensure_advertiser_id(args))
    raw = [x.strip() for x in args.unit_ids.split(",") if x.strip()]
    if not raw:
        raise SystemExit("--unit-ids 不能为空")
    try:
        ids = [int(x) for x in raw]
    except ValueError as exc:
        raise SystemExit(f"--unit-ids 必须全部为数字: {exc}")
    seen, unique = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            unique.append(i)
    bid_yuan = float(args.bid)
    validate_bid_yuan(bid_yuan, "--bid")
    bid_li = int(round(bid_yuan * 1000))
    BATCH = 50
    batches = [unique[i:i + BATCH] for i in range(0, len(unique), BATCH)]
    results = []
    for batch in batches:
        payload = {"advertiser_id": advertiser_id, "unit_ids": batch, "bid": bid_li}
        try:
            resp = client.request_json(c.UNIT_UPDATE_BID, payload, dry_run=args.dry_run)
            results.append({"batch": batch, "ok": True, "response": resp})
        except Exception as exc:
            results.append({"batch": batch, "ok": False, "error": str(exc)})
    output_result(results, args.output)
