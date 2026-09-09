#!/usr/bin/env python3
"""
加载账号列表（resource=account，分页）。

默认自动翻页直至无更多数据或已达 totalNum；可用 --one-page 只拉一页。
输出为 List<map>：字段顺序与 connectors/account-list.md「data.rows[]」一致，并带
  _data_source=account_list、_page_num；接口额外字段保留在后方。

依赖：Python 3.9+，标准库。userId 从环境变量 JULANG_OS_USER_IDENTITY / MOZI_USER_ID 自动读取。参见 connectors/account-list.md。

示例（在 guides/rta-data-queryer/scripts/load 目录下）：
  python load_account_list.py -m TENCENT --page-size 50

  python load_account_list.py -m TENCENT --one-page --page-num 1
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from rta_common import (
    ROW_THRESHOLD_WRITE_FILE,
    add_user_identity_argument,
    extract_account_list_page,
    get_data,
    output_list_map,
    require_user_identity,
)

# 与 connectors/account-list.md「data.rows[] 单条字段」表顺序一致
_ACCOUNT_LIST_KEYS = (
    "account_id",
    "task_id",
    "task_name",
    "biz_name",
    "media",
    "budget",
)


def normalize_account_list_row(row: dict[str, Any], *, page_num: int) -> dict[str, Any]:
    """统一字段顺序；保留接口可能多返回的字段。"""
    merged = dict(row)
    core = {k: merged.get(k) for k in _ACCOUNT_LIST_KEYS}
    out: dict[str, Any] = {k: core[k] for k in _ACCOUNT_LIST_KEYS}
    for k, v in merged.items():
        if k not in out and not k.startswith("_"):
            out[k] = v
    out["_data_source"] = "account_list"
    out["_page_num"] = page_num
    return out


def fetch_account_list_page(
    user_id: str,
    media: str,
    page_num: int,
    page_size: int,
    keyword: str,
    biz_name: str,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "resource": "account",
        "userId": user_id,
        "returnTotalNum": "true",
        "pageNum": str(page_num),
        "pageSize": str(page_size),
        "media": media,
        "keyword": keyword,
        "bizName": biz_name,
    }
    payload = get_data(params)
    return extract_account_list_page(payload)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="加载账号列表（分页），默认拉取全部页并合并为 List<map>。"
    )
    add_user_identity_argument(ap)
    ap.add_argument("--media", "-m", required=True, help="如 TENCENT")
    ap.add_argument(
        "--page-size",
        type=int,
        default=50,
        help="每页条数，默认 50",
    )
    ap.add_argument(
        "--page-num",
        type=int,
        default=1,
        help="起始页码（从 1 起）；与 --one-page 联用只拉该页",
    )
    ap.add_argument(
        "--one-page",
        action="store_true",
        help="只请求一页（page-num），不自动翻页",
    )
    ap.add_argument(
        "--max-pages",
        type=int,
        default=0,
        help="自动翻页时的最大页数保护，0 表示不限制",
    )
    ap.add_argument("--keyword", default="", help="搜索关键字，默认空字符串")
    ap.add_argument("--biz-name", default="", dest="biz_name", help="业务名称筛选，默认空字符串")
    ap.add_argument(
        "-o",
        "--out",
        default=None,
        help="输出 JSON：绝对路径则写入该路径；相对路径写入当前目录下 cache_data/；省略时默认文件名也在 cache_data/",
    )
    ap.add_argument("--always-file", action="store_true")
    args = ap.parse_args()
    user_id = require_user_identity(ap, args.user_identity)

    page_size = max(1, args.page_size)
    all_rows: list[dict[str, Any]] = []
    page_num = max(1, args.page_num)
    total_num: int | None = None
    pages_fetched = 0

    while True:
        block = fetch_account_list_page(
            user_id,
            args.media,
            page_num,
            page_size,
            args.keyword,
            args.biz_name,
        )
        rows = block["rows"]
        if total_num is None and block.get("totalNum") is not None:
            try:
                total_num = int(block["totalNum"])
            except (TypeError, ValueError):
                total_num = None

        for r in rows:
            all_rows.append(normalize_account_list_row(r, page_num=page_num))

        pages_fetched += 1

        if args.one_page:
            break
        if not rows:
            break
        if len(rows) < page_size:
            break
        if total_num is not None and len(all_rows) >= total_num:
            break
        if args.max_pages and pages_fetched >= args.max_pages:
            break

        page_num += 1

    stem = "account_list"
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
