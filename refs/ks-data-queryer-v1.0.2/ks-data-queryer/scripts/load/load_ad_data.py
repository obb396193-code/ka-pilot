#!/usr/bin/env python3
"""
流水线环节一：加载广告粒度数据（仅 ad_realtime；无离线广告接口）。

批量入参：
  - **`adIds` 可选**：不传 `--ad-ids` / `--ad-ids-file` 且不用 `plan-json` 填广告 ID 时，请求不带 `adIds`（与 connectors）。
  - 单账户：`--account-id` 与可选 `--ad-ids` / `--ad-ids-file`
  - 多账户：`--plan-json`，形如 {\"账户ID\": [\"广告ID\", ...], ...}；某账户下数组可为 `[]` 表示不传 `adIds` 仅按账户拉取
  - 单日：`--ds 20260414`；多日：多个 `ds`；`--batch-size`：有 `adIds` 时每请求条数上限（默认 80）；`--hh`：可选累计小时。

输出：每行统一为 connectors/ad-realtime.md 中的 `data[]` 字段顺序，并附加
  `_data_source`、`_query_ds`、可选 `_query_account_ids`、`_query_ad_ids`（本次请求是否带 adIds）；加载阶段写入 **ctr**、**cvr**：
  ctr = ad_click_h/ad_exposure_h，cvr = ad_conversion_h/ad_click_h（分母为 0 或缺失为 null）。

依赖：Python 3.9+，标准库。userId 从环境变量 JULANG_OS_USER_IDENTITY / MOZI_USER_ID 自动读取。media 默认 KUAISHOU。

示例（在 ks-data-queryer/scripts/load 目录下）：
  python load_ad_data.py --account-id 78106571 \\
    --ad-ids 93920275766,94089748117 --ds 20260414

  python load_ad_data.py --plan-json ads_by_account.json \\
    --ds 20260413 20260414

  # 不传账户（请求不带 accountIds）：
  python load_ad_data.py --ad-ids 93920275766 --ds 20260414

  # 不传 adIds（仅 userId/media/ds 等，由服务返回可见广告）：
  python load_ad_data.py --ds 20260414
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

from ks_common import (
    DEFAULT_MEDIA,
    ROW_THRESHOLD_WRITE_FILE,
    add_user_identity_argument,
    chunks,
    enrich_ad_ctr_cvr,
    extract_data_list,
    get_data,
    output_list_map,
    require_user_identity,
)

# 与 connectors/ad-realtime.md「data[] 单条字段」表顺序一致
_AD_REALTIME_KEYS = (
    "is_old_ad",
    "account_deduction_rate_h",
    "ad_budget_h",
    "ad_budget_usage_rate_h",
    "is_main_ad_h",
    "ad_cost_h",
    "ad_name",
    "ad_cpm_h",
    "last_sync_time",
    "biz_name",
    "task_id",
    "ad_conversion_h",
    "media",
    "ad_create_time",
    "ds",
    "ad_real_conversion_h",
    "ad_id",
    "account_id",
    "account_name",
    "account_ad_cpm_avg_h",
    "ad_bid_h",
    "ad_exposure_h",
    "ad_click_h",
    "ad_real_cpa_h",
    "ad_cpa_h",
    "assessment_cost",
)


def _ordered_ad_shape(values: dict[str, Any]) -> dict[str, Any]:
    return {k: values.get(k) for k in _AD_REALTIME_KEYS}


def normalize_ad_realtime_row(
    row: dict[str, Any],
    *,
    query_account_ids: str | None,
    query_ad_ids: str | None,
    query_ds: str,
) -> dict[str, Any]:
    """与接口 `data[]` 对齐：先输出文档顺序字段，再附带接口可能新增的其它字段。"""
    merged = dict(row)
    core = _ordered_ad_shape({k: merged.get(k) for k in _AD_REALTIME_KEYS})
    out: dict[str, Any] = dict(core)
    for k, v in merged.items():
        if k not in out and not k.startswith("_"):
            out[k] = v
    out["_data_source"] = "ad_realtime"
    out["_query_ds"] = query_ds
    if query_account_ids:
        out["_query_account_ids"] = query_account_ids
    if query_ad_ids:
        out["_query_ad_ids"] = query_ad_ids
    enrich_ad_ctr_cvr(out)
    return out


def fetch_ad_realtime(
    user_id: str,
    media: str,
    account_ids_param: str | None,
    ad_ids_batch: list[str],
    ds: str,
    hh: str | None,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "resource": "ad_realtime",
        "userId": user_id,
        "ds": ds,
        "media": media,
    }
    if ad_ids_batch:
        params["adIds"] = ",".join(ad_ids_batch)
    if account_ids_param:
        params["accountIds"] = account_ids_param
    if hh is not None and hh != "":
        params["hh"] = hh
    payload = get_data(params)
    rows = extract_data_list(payload)
    query_ad_ids = ",".join(ad_ids_batch) if ad_ids_batch else None
    return [
        normalize_ad_realtime_row(
            r,
            query_account_ids=account_ids_param,
            query_ad_ids=query_ad_ids,
            query_ds=ds,
        )
        for r in rows
    ]


def _parse_ad_id_list(raw: str) -> list[str]:
    return [x.strip() for x in raw.replace("\n", ",").split(",") if x.strip()]


def parse_ad_ids_file(path: str) -> list[str]:
    p = Path(path).expanduser().read_text(encoding="utf-8").strip()
    try:
        data = json.loads(p)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except json.JSONDecodeError:
        pass
    return _parse_ad_id_list(p)


def load_plan(args: argparse.Namespace) -> dict[str, list[str]]:
    if args.plan_json:
        raw = Path(args.plan_json).expanduser().read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise SystemExit("--plan-json 顶层必须是对象：accountId -> [adId,...]，数组可为空表示不传 adIds")
        out: dict[str, list[str]] = {}
        for k, v in data.items():
            if not isinstance(v, list):
                raise SystemExit(f"键 {k!r} 的值必须是广告 ID 数组（可为空数组）")
            aid = str(k).strip()
            ids = [str(x).strip() for x in v if str(x).strip()]
            out[aid] = list(dict.fromkeys(ids))
        return out

    if args.ad_ids_file:
        ids = parse_ad_ids_file(args.ad_ids_file)
    elif args.ad_ids:
        ids = _parse_ad_id_list(args.ad_ids)
    else:
        # 不传 adIds：由接口按 userId/media/ds 等在服务端可见范围内返回
        return {"": []}

    aid = (args.account_id or "").strip()
    dedup = list(dict.fromkeys(ids))
    return {aid: dedup} if aid else {"": dedup}


def _default_stem(date_list: list[str]) -> str:
    ds_sorted = sorted(date_list)
    if len(ds_sorted) == 1:
        return f"ad_load_{ds_sorted[0]}"
    return f"ad_load_{ds_sorted[0]}_{ds_sorted[-1]}"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="加载广告实时数据：多账户、多广告、多日；输出与 ad-realtime data[] 对齐。"
    )
    add_user_identity_argument(ap)
    ap.add_argument("--media", "-m", default=DEFAULT_MEDIA, help=f"媒体，默认 {DEFAULT_MEDIA}")
    ap.add_argument(
        "--ds",
        "-d",
        nargs="+",
        required=True,
        help="统计日 YYYYMMDD，可多个",
    )
    ap.add_argument("--hh", default=None, help="可选，0～hh 累计小时；不传为全天")
    ap.add_argument(
        "--account-id",
        help="单个账户 ID；不传则请求不带 accountIds（与 connectors 一致，由服务按权限筛选）",
    )
    ap.add_argument(
        "--ad-ids",
        help="英文逗号分隔的广告 ID；不传则请求不带 adIds（与 connectors）",
    )
    ap.add_argument(
        "--ad-ids-file",
        help="广告 ID 列表文件：JSON 数组、每行一个、或逗号分隔",
    )
    ap.add_argument(
        "--plan-json",
        help='多账户：{"账户ID": ["广告ID", ...], ...}；值为 [] 表示该账户不传 adIds',
    )
    ap.add_argument(
        "--batch-size",
        type=int,
        default=80,
        help="单请求最大 adIds 数量，默认 80",
    )
    ap.add_argument(
        "-o",
        "--out",
        default=None,
        help="输出 JSON：绝对路径则写入该路径；相对路径写入当前目录下 cache_data/；省略时默认文件名也在 cache_data/",
    )
    ap.add_argument("--always-file", action="store_true")
    args = ap.parse_args()
    user_id = require_user_identity(ap, args.user_identity)

    plan = load_plan(args)
    if not plan:
        print("计划为空", file=sys.stderr)
        sys.exit(1)

    date_list = list(dict.fromkeys(args.ds))

    all_rows: list[dict[str, Any]] = []
    for ds in date_list:
        for account_key, ad_list in plan.items():
            acc = (account_key or "").strip()
            account_ids_param = acc if acc else None
            if not ad_list:
                all_rows.extend(
                    fetch_ad_realtime(
                        user_id,
                        args.media,
                        account_ids_param,
                        [],
                        ds,
                        args.hh,
                    )
                )
                continue
            for batch in chunks(ad_list, args.batch_size):
                all_rows.extend(
                    fetch_ad_realtime(
                        user_id,
                        args.media,
                        account_ids_param,
                        batch,
                        ds,
                        args.hh,
                    )
                )

    stem = _default_stem(date_list)
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
