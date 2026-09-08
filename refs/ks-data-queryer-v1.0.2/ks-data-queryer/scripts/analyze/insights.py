#!/usr/bin/env python3
"""
分析层业务封装：在 load 产出的 List<map> JSON 上做高频聚合/筛查。

设计：
  - 纯 pandas（依赖 records_io 读 JSON）；复杂跨表对比可改用同目录 duckdb_sql。
  - 输入是 `scripts/load/` 产出的 JSON（账户行或广告行）；列缺失时自动跳过派生项。
  - 派生口径与 load 一致：ctr=点击/曝光，cvr=转化(OCPX回传)/点击；真实成本 cpa=消耗/真实转化（分母为 0 → null）。
  - **离线口径 caveat**：离线账户行不带转化（account_conversion / account_real_conversion 为 null），
    故纯离线数据的 cvr/cpa 不可用（转化在 `_offline_snapshot.newaac_uv_attrib_install`，biz=CVR 时）。
    需要转化/真实成本趋势时应使用实时口径（当日或历史日的 account_realtime）。

封装函数：
  - account_daily_trend(df)  账户**按日**汇总 + 环比（DoD）：消耗/曝光/点击/转化、ctr/cvr/cpa。
  - account_summary(df)      账户**按 account_id** 区间汇总：总消耗、天数、日均消耗、ctr/cvr/cpa。
  - ad_cost_anomaly(df, ...) 广告**异常成本筛查**：高消耗零转化 / 真实成本超目标，输出命中行 + reason。
  - top_ads(df, by, n)       按某指标取 Top N 广告。

依赖：pip install -r requirements.txt（pandas、duckdb）。

命令行（在 scripts/analyze 目录下，或 python scripts/analyze/insights.py ...）：
  python insights.py account-trend   cache_data/account_load_20260520_20260529.json
  python insights.py account-summary cache_data/account_load_20260520_20260529.json
  python insights.py ad-anomaly      cache_data/ad_load_20260529.json --min-cost 100 --target-cpa 50
  python insights.py top-ads         cache_data/ad_load_20260529.json --by ad_cost_h -n 10
  # 追加 --json 以 JSON（List<map>）输出，便于继续喂给其它脚本
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from records_io import load_records_json

# ---- 列名约定（与 connectors / load 输出一致）----
_ACCOUNT_SUM_COLS = (
    "account_cost",
    "account_exposure",
    "account_click",
    "account_conversion",
    "account_real_conversion",
    "assessment_cost",
)
_AD_SUM_COLS = (
    "ad_cost_h",
    "ad_exposure_h",
    "ad_click_h",
    "ad_conversion_h",
    "ad_real_conversion_h",
)


def _num(df: pd.DataFrame, cols) -> pd.DataFrame:
    """将指定列安全转为数值（无法解析 → NaN）；缺失列补 0 列以便聚合。"""
    out = df.copy()
    for c in cols:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")
        else:
            out[c] = 0.0
    return out


def _safe_div(numer: pd.Series, denom: pd.Series) -> pd.Series:
    """逐元素安全除；分母为 0 或缺失 → NaN。结果恒为 float64。"""
    n = pd.to_numeric(numer, errors="coerce").astype("float64")
    d = pd.to_numeric(denom, errors="coerce").astype("float64")
    d = d.where(d != 0, np.nan)
    return n / d


def _add_account_rates(g: pd.DataFrame) -> pd.DataFrame:
    g["ctr"] = _safe_div(g["account_click"], g["account_exposure"])
    g["cvr"] = _safe_div(g["account_conversion"], g["account_click"])
    # 真实转化成本：消耗 / 真实转化
    g["cpa"] = _safe_div(g["account_cost"], g["account_real_conversion"])
    return g


def account_daily_trend(df: pd.DataFrame) -> pd.DataFrame:
    """账户数据按 `ds` 汇总并计算环比（DoD）。返回按 ds 升序的 DataFrame。"""
    if df.empty or "ds" not in df.columns:
        return pd.DataFrame()
    d = _num(df, _ACCOUNT_SUM_COLS)
    g = d.groupby("ds", as_index=False)[list(_ACCOUNT_SUM_COLS)].sum()
    g = g.sort_values("ds").reset_index(drop=True)
    g = _add_account_rates(g)
    # 环比：消耗、真实成本、ctr 的日环比变化率
    for col in ("account_cost", "cpa", "ctr"):
        g[f"{col}_dod"] = g[col].pct_change()
    return g


def account_summary(df: pd.DataFrame) -> pd.DataFrame:
    """按 account_id 在区间内汇总；含天数、日均消耗、ctr/cvr/cpa。按总消耗降序。"""
    if df.empty or "account_id" not in df.columns:
        return pd.DataFrame()
    d = _num(df, _ACCOUNT_SUM_COLS)
    grp = d.groupby("account_id", as_index=False)
    g = grp[list(_ACCOUNT_SUM_COLS)].sum()
    # 名称与天数
    if "account_name" in d.columns:
        names = grp["account_name"].agg(lambda s: s.dropna().iloc[0] if s.notna().any() else None)
        g = g.merge(names, on="account_id", how="left")
    if "ds" in d.columns:
        days = d.groupby("account_id", as_index=False)["ds"].nunique().rename(
            columns={"ds": "days"}
        )
        g = g.merge(days, on="account_id", how="left")
        g["avg_daily_cost"] = _safe_div(g["account_cost"], g["days"])
    g = _add_account_rates(g)
    return g.sort_values("account_cost", ascending=False).reset_index(drop=True)


def ad_cost_anomaly(
    df: pd.DataFrame,
    *,
    min_cost: float = 100.0,
    target_cpa: float | None = None,
) -> pd.DataFrame:
    """
    广告异常成本筛查（按 ad_id 在区间内聚合后判定）。命中规则：
      1. **高消耗零转化**：真实转化=0 且 消耗 >= min_cost。
      2. **真实成本超目标**：真实转化>0 且 real_cpa(=消耗/真实转化) > target_cpa（需传 target_cpa）。
    返回命中行（含 reason、real_cpa），按消耗降序。
    """
    if df.empty or "ad_id" not in df.columns:
        return pd.DataFrame()
    d = _num(df, _AD_SUM_COLS)
    grp = d.groupby("ad_id", as_index=False)
    g = grp[list(_AD_SUM_COLS)].sum()
    for meta in ("ad_name", "account_id", "account_name"):
        if meta in d.columns:
            m = grp[meta].agg(lambda s: s.dropna().iloc[0] if s.notna().any() else None)
            g = g.merge(m, on="ad_id", how="left")
    g["real_cpa"] = _safe_div(g["ad_cost_h"], g["ad_real_conversion_h"])

    reasons: list[str | None] = []
    for _, r in g.iterrows():
        rs: list[str] = []
        cost = r["ad_cost_h"] or 0
        real_conv = r["ad_real_conversion_h"] or 0
        if real_conv == 0 and cost >= min_cost:
            rs.append(f"高消耗零转化(消耗≥{min_cost:g})")
        if target_cpa is not None and real_conv > 0 and pd.notna(r["real_cpa"]) and r["real_cpa"] > target_cpa:
            rs.append(f"真实成本超目标(>{target_cpa:g})")
        reasons.append("；".join(rs) if rs else None)
    g["reason"] = reasons
    flagged = g[g["reason"].notna()].copy()
    return flagged.sort_values("ad_cost_h", ascending=False).reset_index(drop=True)


def top_ads(
    df: pd.DataFrame, *, by: str = "ad_cost_h", n: int = 10, ascending: bool = False
) -> pd.DataFrame:
    """按某列取 Top N 广告（按 ad_id 聚合求和后排序）。"""
    if df.empty or "ad_id" not in df.columns or by not in df.columns:
        return pd.DataFrame()
    cols = list(dict.fromkeys(list(_AD_SUM_COLS) + [by]))
    d = _num(df, cols)
    grp = d.groupby("ad_id", as_index=False)
    g = grp[cols].sum()
    for meta in ("ad_name", "account_id"):
        if meta in d.columns:
            m = grp[meta].agg(lambda s: s.dropna().iloc[0] if s.notna().any() else None)
            g = g.merge(m, on="ad_id", how="left")
    g["ctr"] = _safe_div(g["ad_click_h"], g["ad_exposure_h"])
    g["cvr"] = _safe_div(g["ad_conversion_h"], g["ad_click_h"])
    return g.sort_values(by, ascending=ascending).head(n).reset_index(drop=True)


# ---------------------------- CLI ----------------------------

def _emit(df: pd.DataFrame, as_json: bool) -> None:
    if df.empty:
        print("（无数据 / 无命中）", file=sys.stderr)
    if as_json:
        print(df.to_json(orient="records", force_ascii=False, indent=2))
    else:
        with pd.option_context(
            "display.max_rows", None, "display.max_columns", None, "display.width", 200
        ):
            print(df.to_string(index=False))


def main() -> None:
    ap = argparse.ArgumentParser(description="ks-data-queryer 分析封装：趋势 / 汇总 / 异常筛查 / Top。")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_trend = sub.add_parser("account-trend", help="账户按日汇总 + 环比")
    p_trend.add_argument("input", help="load 产出的账户 JSON（List<map>）")

    p_sum = sub.add_parser("account-summary", help="账户按 account_id 区间汇总")
    p_sum.add_argument("input")

    p_anom = sub.add_parser("ad-anomaly", help="广告异常成本筛查")
    p_anom.add_argument("input", help="load 产出的广告 JSON（List<map>）")
    p_anom.add_argument("--min-cost", type=float, default=100.0, help="高消耗零转化阈值（默认 100）")
    p_anom.add_argument("--target-cpa", type=float, default=None, help="目标真实成本；传入后启用超目标规则")

    p_top = sub.add_parser("top-ads", help="按指标取 Top N 广告")
    p_top.add_argument("input")
    p_top.add_argument("--by", default="ad_cost_h", help="排序列，默认 ad_cost_h")
    p_top.add_argument("-n", type=int, default=10, help="取前 N，默认 10")
    p_top.add_argument("--asc", action="store_true", help="升序（默认降序）")

    for p in (p_trend, p_sum, p_anom, p_top):
        p.add_argument("--json", action="store_true", help="以 JSON（List<map>）输出")

    args = ap.parse_args()
    df = load_records_json(args.input)

    if args.cmd == "account-trend":
        out = account_daily_trend(df)
    elif args.cmd == "account-summary":
        out = account_summary(df)
    elif args.cmd == "ad-anomaly":
        out = ad_cost_anomaly(df, min_cost=args.min_cost, target_cpa=args.target_cpa)
    elif args.cmd == "top-ads":
        out = top_ads(df, by=args.by, n=args.n, ascending=args.asc)
    else:  # pragma: no cover
        ap.error(f"未知子命令: {args.cmd}")

    _emit(out, args.json)


if __name__ == "__main__":
    main()
