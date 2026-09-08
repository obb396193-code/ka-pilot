"""RTA get_data API 共用：HTTP GET、分片、结果写出。"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterator

GET_DATA_BASE = "https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data"

ENV_JULANG_OS_USER_IDENTITY = "JULANG_OS_USER_IDENTITY"
ENV_MOZI_USER_ID = "MOZI_USER_ID"
_USER_IDENTITY_PLACEHOLDERS = frozenset(
    {"null", "nil", "none", "undefined", "n/a", "na"}
)


def effective_user_identity(value: str | None) -> str:
    """空串与常见占位符（如 null）视为未设置，与 tencentads-cli ResolveUserIdentity 一致。"""
    if value is None:
        return ""
    v = str(value).strip()
    if not v:
        return ""
    if v.lower() in _USER_IDENTITY_PLACEHOLDERS:
        return ""
    return v


def resolve_user_identity(cli_value: str | None = None) -> str:
    """JULANG_OS_USER_IDENTITY → MOZI_USER_ID → 隐藏的 CLI 参数（数字或 opaque 字符串均可）。"""
    for candidate in (
        os.environ.get(ENV_JULANG_OS_USER_IDENTITY),
        os.environ.get(ENV_MOZI_USER_ID),
        cli_value,
    ):
        if v := effective_user_identity(candidate):
            return v
    return ""


def add_user_identity_argument(ap: argparse.ArgumentParser) -> None:
    """注册隐藏的 userId 回退参数（不出现在 --help）。"""
    ap.add_argument(
        "--user-identity",
        "--user-id",
        "-u",
        dest="user_identity",
        default=None,
        help=argparse.SUPPRESS,
    )


def require_user_identity(ap: argparse.ArgumentParser, cli_value: str | None) -> str:
    user_id = resolve_user_identity(cli_value)
    if not user_id:
        ap.error(
            f"缺少 userId：请设置环境变量 {ENV_JULANG_OS_USER_IDENTITY} 或 {ENV_MOZI_USER_ID}；"
            "若环境变量不可用，可传 --user-identity / --user-id / -u <id>"
        )
    return user_id

# 加载阶段派生指标（与业务约定一致）：ctr = 点击/曝光，cvr = 转化/点击；分母为 0 或缺失则为 null


def ratio_or_none(numerator: Any, denominator: Any) -> float | None:
    """安全除法；分母为 0 或 None、分子为 None 时返回 None。"""
    if denominator is None:
        return None
    try:
        d = float(denominator)
    except (TypeError, ValueError):
        return None
    if d == 0:
        return None
    if numerator is None:
        return None
    try:
        return float(numerator) / d
    except (TypeError, ValueError):
        return None


def enrich_account_ctr_cvr(row: dict[str, Any]) -> None:
    """就地写入 ctr、cvr（账号统一字段：account_click / account_exposure / account_conversion）。"""
    row["ctr"] = ratio_or_none(row.get("account_click"), row.get("account_exposure"))
    row["cvr"] = ratio_or_none(row.get("account_conversion"), row.get("account_click"))


def enrich_ad_ctr_cvr(row: dict[str, Any]) -> None:
    """就地写入 ctr、cvr（广告字段：ad_click_h / ad_exposure_h / ad_conversion_h）。"""
    row["ctr"] = ratio_or_none(row.get("ad_click_h"), row.get("ad_exposure_h"))
    row["cvr"] = ratio_or_none(row.get("ad_conversion_h"), row.get("ad_click_h"))

# 超过此行数则写入当前工作目录下 cache_data/ 中的 JSON 文件（List<map>）
ROW_THRESHOLD_WRITE_FILE = 50

# 默认落盘目录（相对当前工作目录）
CACHE_DATA_DIR = "cache_data"


def chunks(seq: list[str], n: int) -> Iterator[list[str]]:
    if n <= 0:
        raise ValueError("batch size must be positive")
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def yyyymmdd_range_inclusive(begin: str, end: str) -> list[str]:
    b = datetime.strptime(begin, "%Y%m%d").date()
    e = datetime.strptime(end, "%Y%m%d").date()
    if e < b:
        raise ValueError("endDate must be >= beginDate")
    out: list[str] = []
    d = b
    while d <= e:
        out.append(d.strftime("%Y%m%d"))
        d += timedelta(days=1)
    return out


def today_yyyymmdd() -> str:
    return date.today().strftime("%Y%m%d")


def query_param_str(value: Any) -> str:
    """将 get_data query 值安全序列化为字符串（userId 可为数字或 opaque，不做数值解析）。"""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return format(value, "g")
    return str(value)


def split_offline_realtime_dates(
    dates: list[str], today: str
) -> tuple[list[str], list[str]]:
    """早于 today 的日期走离线；等于 today 的走实时。晚于 today 报错。"""
    offline: list[str] = []
    rt: list[str] = []
    for ds in dates:
        if ds > today:
            raise ValueError(f"日期不能晚于今日: {ds} (today={today})")
        if ds < today:
            offline.append(ds)
        else:
            rt.append(ds)
    return offline, rt


def get_data(params: dict[str, Any], timeout: float = 120.0) -> dict[str, Any]:
    """调用 get_data，返回解析后的 JSON 对象。"""
    str_params = {str(k): query_param_str(v) for k, v in params.items()}
    q = urllib.parse.urlencode(str_params, safe=",")
    url = f"{GET_DATA_BASE}?{q}"
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        raise RuntimeError(f"HTTP {e.code} {e.reason}: {body[:2000]}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"请求失败: {e}") from e

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"响应非 JSON: {raw[:500]}") from e


def extract_data_list(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if not payload.get("successful"):
        msg = payload.get("message") or payload.get("code") or "unknown"
        raise RuntimeError(f"API unsuccessful: {msg}")
    data = payload.get("data")
    if data is None:
        return []
    if not isinstance(data, list):
        raise RuntimeError("data 不是数组")
    return [x for x in data if isinstance(x, dict)]


def extract_account_list_page(payload: dict[str, Any]) -> dict[str, Any]:
    """
    resource=account 分页接口：`data` 为对象，账号行在 `data.rows`。
    返回 {"rows": [...], "totalNum", "pageSize", "pageNum"}。
    """
    if not payload.get("successful"):
        msg = payload.get("message") or payload.get("code") or "unknown"
        raise RuntimeError(f"API unsuccessful: {msg}")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise RuntimeError("account 列表的 data 应为对象")
    rows = data.get("rows")
    if rows is None:
        rows = []
    if not isinstance(rows, list):
        raise RuntimeError("data.rows 不是数组")
    row_dicts = [x for x in rows if isinstance(x, dict)]
    return {
        "rows": row_dicts,
        "totalNum": data.get("totalNum"),
        "pageSize": data.get("pageSize"),
        "pageNum": data.get("pageNum"),
    }


def resolve_json_output_path(out_path: str | None, default_stem: str) -> Path:
    """
    落盘路径规则：
    - 未指定 `out_path`：`cwd/cache_data/{default_stem}.json`
    - `out_path` 为绝对路径：原样使用
    - `out_path` 为相对路径：`cwd/cache_data/` 下解析（便于统一缓存目录）
    父目录不存在时会创建。
    """
    if not out_path:
        root = Path.cwd() / CACHE_DATA_DIR
        root.mkdir(parents=True, exist_ok=True)
        return root / f"{default_stem}.json"

    p = Path(out_path).expanduser()
    if p.is_absolute():
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    root = Path.cwd() / CACHE_DATA_DIR
    root.mkdir(parents=True, exist_ok=True)
    path = (root / p).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def output_list_map(
    rows: list[dict[str, Any]],
    *,
    default_stem: str,
    out_path: str | None,
    always_file: bool,
) -> Path | None:
    """
    List<map> 输出：超过 ROW_THRESHOLD_WRITE_FILE 行则写入 `cwd/cache_data/` 下文件；
    否则打印到 stdout（除非 always_file）。
    返回写入的文件路径；若打印到 stdout 则返回 None。
    """
    text = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    n = len(rows)
    should_file = always_file or n > ROW_THRESHOLD_WRITE_FILE

    if should_file:
        path = resolve_json_output_path(out_path, default_stem)
        path.write_text(text, encoding="utf-8")
        return path

    print(text, end="")
    return None
