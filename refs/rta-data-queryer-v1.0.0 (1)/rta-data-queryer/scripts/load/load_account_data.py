#!/usr/bin/env python3
"""
流水线环节一：加载账户粒度数据。

规则：
  - 日期区间 [begin-date, end-date] 内，早于「今日」的日期走 account_offline（一次请求覆盖区间内所有离线日）；
    等于「今日」的日期走 account_realtime（按 ds 拉取）。
  - **离线兜底（默认开启）**：离线可能产出不及时；对「历史日」在拉完离线后，再按日拉 account_realtime。
    若某 (account_id, ds) 在离线结果中**没有任何一行**，则用该日实时行补上，并设
    `_gap_filled_by_realtime=true`（离线仍优先，不覆盖已有离线行）。
  - 支持多账户：按 --batch-size 分批请求；**不传 --account-ids 时请求不带 accountIds**（与 connectors）。可多天、多账号同一次运行合并输出。
  - 输出每行统一为「account_realtime 形」字段名（与 connectors/account-realtime.md 一致），离线行由
    cost_api/exp_pv_api/clk_api 等映射到 account_cost/account_exposure/account_click；
    离线独有指标放入 _offline_snapshot，_data_source 标明 account_offline | account_realtime。
  - 加载阶段写入 **ctr**、**cvr**：ctr = account_click/account_exposure，cvr = account_conversion/account_click
    （分母为 0 或缺失为 null）；离线行若尚无 account_conversion，则 cvr 为 null。

依赖：Python 3.9+，标准库。userId 从环境变量 JULANG_OS_USER_IDENTITY / MOZI_USER_ID 自动读取。

示例（在 guides/rta-data-queryer/scripts/load 目录下）：
  python load_account_data.py --media TENCENT \\
    --account-ids 78106571,78106662 --begin-date 20260410 --end-date 20260414

  python load_account_data.py -m TENCENT -a 78106571 --begin-date 20260414 --end-date 20260414 \\
    --today 20260414
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from rta_common import (
    ROW_THRESHOLD_WRITE_FILE,
    add_user_identity_argument,
    chunks,
    enrich_account_ctr_cvr,
    extract_data_list,
    get_data,
    output_list_map,
    require_user_identity,
    split_offline_realtime_dates,
    today_yyyymmdd,
    yyyymmdd_range_inclusive,
)

# 与 account-realtime 接口字段对齐的键顺序（便于阅读与下游固定 schema）
_ACCOUNT_REALTIME_KEYS = (
    "account_id",
    "account_name",
    "media",
    "ds",
    "task_id",
    "biz_name",
    "is_main_account",
    "last_sync_time",
    "account_budget",
    "account_budget_usage_rate",
    "account_cost",
    "account_exposure",
    "account_click",
    "account_conversion",
    "account_real_conversion",
    "account_cpa",
    "account_deduction_rate",
    "account_main_ad_cost",
    "account_main_ad_cost_proportion",
    "assessment_cost",
)


def _ordered_realtime_shape(values: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k in _ACCOUNT_REALTIME_KEYS:
        out[k] = values.get(k)
    return out


def normalize_realtime_row(row: dict[str, Any]) -> dict[str, Any]:
    """接口已为 account_realtime 结构，原样保留并加来源标记。"""
    merged = dict(row)
    out = _ordered_realtime_shape({k: merged.get(k) for k in _ACCOUNT_REALTIME_KEYS})
    # 保留接口可能返回的额外字段（若有）
    for k, v in merged.items():
        if k not in out and not k.startswith("_"):
            out[k] = v
    out["_data_source"] = "account_realtime"
    enrich_account_ctr_cvr(out)
    return out


def normalize_offline_row(row: dict[str, Any]) -> dict[str, Any]:
    """
    离线行 -> account_realtime 形：消耗/曝光/点击从 MAPI 字段映射；
    实时侧才有的字段置为 null；完整离线行保留在 _offline_snapshot。
    """
    base = {
        "account_id": row.get("account_id"),
        "account_name": row.get("account_name"),
        "media": row.get("media"),
        "ds": row.get("ds"),
        "task_id": row.get("task_id"),
        "biz_name": row.get("biz_name"),
        "is_main_account": None,
        "last_sync_time": None,
        "account_budget": None,
        "account_budget_usage_rate": None,
        "account_cost": row.get("cost_api"),
        "account_exposure": row.get("exp_pv_api"),
        "account_click": row.get("clk_api"),
        "account_conversion": None,
        "account_real_conversion": None,
        "account_cpa": None,
        "account_deduction_rate": None,
        "account_main_ad_cost": None,
        "account_main_ad_cost_proportion": None,
        "assessment_cost": None,
    }
    out = _ordered_realtime_shape(base)
    out["_data_source"] = "account_offline"
    out["_offline_snapshot"] = dict(row)
    enrich_account_ctr_cvr(out)
    return out


def offline_account_ds_keys(rows: list[dict[str, Any]]) -> set[tuple[str, str]]:
    """离线行中出现的 (account_id, ds)，用于判断实时兜底是否还需要补该账户该日。"""
    s: set[tuple[str, str]] = set()
    for r in rows:
        if r.get("_data_source") != "account_offline":
            continue
        aid = r.get("account_id")
        ds = r.get("ds")
        if aid is not None and ds is not None:
            s.add((str(aid), str(ds)))
    return s


def fetch_offline(
    user_id: str,
    media: str,
    account_batch: list[str],
    begin_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    params = {
        "resource": "account_offline",
        "userId": user_id,
        "beginDate": begin_date,
        "endDate": end_date,
        "media": media,
    }
    if account_batch:
        params["accountIds"] = ",".join(account_batch)
    payload = get_data(params)
    rows = extract_data_list(payload)
    return [normalize_offline_row(r) for r in rows]


def fetch_realtime(
    user_id: str, media: str, account_batch: list[str], ds: str
) -> list[dict[str, Any]]:
    params = {
        "resource": "account_realtime",
        "userId": user_id,
        "ds": ds,
        "media": media,
    }
    if account_batch:
        params["accountIds"] = ",".join(account_batch)
    payload = get_data(params)
    rows = extract_data_list(payload)
    return [normalize_realtime_row(r) for r in rows]


def parse_account_ids(raw: str | None, file_path: str | None) -> list[str]:
    if file_path:
        p = Path(file_path).expanduser().read_text(encoding="utf-8").strip()
        try:
            data = json.loads(p)
            if isinstance(data, list):
                return [str(x).strip() for x in data if str(x).strip()]
        except json.JSONDecodeError:
            pass
        return [x.strip() for x in p.replace("\n", ",").split(",") if x.strip()]
    if not raw:
        return []
    return [x.strip() for x in raw.split(",") if x.strip()]


def main() -> None:
    ap = argparse.ArgumentParser(
        description="加载账户数据：离线优先，当日仅实时；支持账户分批。"
    )
    add_user_identity_argument(ap)
    ap.add_argument("--media", "-m", required=True, help="如 TENCENT")
    ap.add_argument(
        "--account-ids",
        "-a",
        default=None,
        help="账户 ID，英文逗号分隔；不传则请求不带 accountIds（由服务按 userId 权限返回）",
    )
    ap.add_argument(
        "--account-ids-file",
        default=None,
        help="账户列表：每行一个 ID，或 JSON 数组，或逗号分隔；与 -a 二选一或皆不传",
    )
    ap.add_argument("--begin-date", "-b", required=True, help="YYYYMMDD")
    ap.add_argument("--end-date", "-e", required=True, help="YYYYMMDD")
    ap.add_argument(
        "--today",
        default=None,
        help="覆盖「今日」判断（YYYYMMDD），默认系统当天；用于回放/测试",
    )
    ap.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="每请求最多账户数，默认 50",
    )
    ap.add_argument(
        "-o",
        "--out",
        default=None,
        help="输出 JSON：绝对路径则写入该路径；相对路径写入当前目录下 cache_data/；省略时默认文件名也在 cache_data/",
    )
    ap.add_argument(
        "--always-file",
        action="store_true",
        help="无论行数多少都写入文件",
    )
    ap.add_argument(
        "--no-offline-snapshot",
        action="store_true",
        help="离线行不附带 _offline_snapshot（仅保留映射后的 account_realtime 形字段）",
    )
    ap.add_argument(
        "--no-redundant-realtime",
        action="store_true",
        help="关闭历史日的实时兜底（默认：离线缺 (account_id,ds) 时用当日 account_realtime 补行）",
    )
    args = ap.parse_args()
    user_id = require_user_identity(ap, args.user_identity)

    today = args.today or today_yyyymmdd()
    accounts = list(
        dict.fromkeys(parse_account_ids(args.account_ids, args.account_ids_file))
    )

    date_list = yyyymmdd_range_inclusive(args.begin_date, args.end_date)
    offline_dates, rt_dates = split_offline_realtime_dates(date_list, today)

    all_rows: list[dict[str, Any]] = []
    redundant_realtime = not args.no_redundant_realtime

    account_batches = (
        list(chunks(accounts, args.batch_size)) if accounts else [[]]
    )
    for batch in account_batches:
        offline_rows_batch: list[dict[str, Any]] = []
        if offline_dates:
            ob, oe = offline_dates[0], offline_dates[-1]
            offline_rows_batch = fetch_offline(
                user_id, args.media, batch, ob, oe
            )
            all_rows.extend(offline_rows_batch)

            if redundant_realtime:
                covered = offline_account_ds_keys(offline_rows_batch)
                for ds in offline_dates:
                    rt_rows = fetch_realtime(
                        user_id, args.media, batch, ds
                    )
                    for r in rt_rows:
                        aid = r.get("account_id")
                        if aid is None:
                            continue
                        row_ds = str(r.get("ds") or ds)
                        key = (str(aid), row_ds)
                        if key in covered:
                            continue
                        r["_gap_filled_by_realtime"] = True
                        all_rows.append(r)

        for ds in rt_dates:
            all_rows.extend(fetch_realtime(user_id, args.media, batch, ds))

    if args.no_offline_snapshot:
        for row in all_rows:
            row.pop("_offline_snapshot", None)

    stem = f"account_load_{args.begin_date}_{args.end_date}"
    path = output_list_map(
        all_rows,
        default_stem=stem,
        out_path=args.out,
        always_file=args.always_file,
    )
    if path:
        print(
            f"已写入 {path}（共 {len(all_rows)} 行，阈值 {ROW_THRESHOLD_WRITE_FILE}）",
            file=sys.stderr,
        )
    else:
        print(
            f"已输出到 stdout（共 {len(all_rows)} 行，<= {ROW_THRESHOLD_WRITE_FILE}）",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
