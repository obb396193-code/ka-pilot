"""`qihang-cli material` 子命令：素材库统计 / 明细查询 / 条件过滤查询。

后端接口已切换至 dataservice-api GET 接口：
  list:  https://dataservice-api.dw.alibaba-inc.com/project/23017/query/material/pool/list
  count: https://dataservice-api.dw.alibaba-inc.com/project/23017/query/material/pool/count
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request

from .. import constants as c
from ..client import QihangApiError
from ..io_utils import CliError, eprint, output_result, print_request_dryrun


def _add_common_filter_flags(p: argparse.ArgumentParser) -> None:
    """count / list / list-all 共享的过滤维度。"""
    p.add_argument("--media", required=True,
                   help="媒体枚举名（必填）。支持：KUAISHOU, TOUTIAO, TENCENT, BAIDU, "
                        "OPPO_NON_SHOP, VIVO_NON_SHOP, XIAO_MI, HUAWEI_NON_SHOP。"
                        "注意：OPPO/VIVO/XIAOMI/HUAWEI 简写不被 dataservice-api 识别，需使用完整枚举名")
    p.add_argument("--pool-ids", "--pool-id", type=int, nargs="+", required=True, dest="pool_ids",
                   help="素材库 id（必填，支持多值并集查询；--pool-id 单值写法向后兼容）")
    p.add_argument("--min-width", type=int, dest="min_width", help="最小宽度（含）")
    p.add_argument("--max-width", type=int, dest="max_width", help="最大宽度（含）")
    p.add_argument("--min-height", type=int, dest="min_height", help="最小高度（含）")
    p.add_argument("--max-height", type=int, dest="max_height", help="最大高度（含）")
    p.add_argument(
        "--inventory-names",
        nargs="+",
        dest="inventory_names",
        help=(
            "版位 inventory_name 列表（多值 OR 取并集），"
            "快手常见值: KUAI_SHOU_YOU_XUAN / KUAI_SHOU_LIAN_MENG / "
            "KUAI_SHOU_SHANG_XIA_DA_PING / ENCOURAGE_VIDEO / OPEN_SCREEN"
        ),
    )
    p.add_argument(
        "--material-spec-names",
        nargs="+",
        dest="material_spec_names",
        help="素材规格 material_spec_name 列表（多值取并集过滤），如 VERTICAL_VIDEO HORIZONTAL_VIDEO",
    )
    p.add_argument(
        "--delivery-page-id",
        dest="delivery_page_id",
        help="承接页 id 单值",
    )
    p.add_argument("--dry-run", action="store_true", help="只打印请求 URL，不发 HTTP")


_ITEM_IDS_API_HELP = (
    "商品 id 列表（空格分隔）。映射到 dataservice-api itemIds + includeNullItemId：\n"
    "  仅普通 id        → itemIds=...，includeNullItemId=false（只查对应商品素材）\n"
    "  仅 NULL          → 不传 itemIds，includeNullItemId=true（只查无商品素材）\n"
    "  id 与 NULL 混用  → itemIds=...，includeNullItemId=true（商品素材 + 无商品素材）\n"
    "无商品素材用 NULL（大小写不敏感；None/nil/~ 也识别）。"
    "注意：list 无法「不传 itemIds 查库内全部」——需先 material count 拿 itemId，再 list/list-all"
)


def _add_item_ids_flag(p: argparse.ArgumentParser, *, required: bool) -> None:
    """添加 --item-ids 参数。空值字面量（NULL/null/None/nil/~/空串）都识别为"查询无商品信息的素材"。"""
    p.add_argument(
        "--item-ids",
        nargs="+",
        required=required,
        help=_ITEM_IDS_API_HELP,
    )


def _add_pagination_flags(p: argparse.ArgumentParser) -> None:
    """list / filter 共享的分页参数。"""
    p.add_argument("--page", type=int, default=1, help="页码（1-based，默认 1）")
    p.add_argument(
        "--page-size",
        type=int,
        default=200,
        dest="page_size",
        help="单页大小（默认 200；正整数，最大 500，超出 cli 端报错；想一次拉全用 list-all）",
    )
    p.add_argument(
        "--fields",
        nargs="+",
        choices=c.MATERIAL_FIELDS,
        help=(
            "希望返回的字段子集；不传或空表示返回全部 11 字段。"
            f" 候选: {c.MATERIAL_FIELDS}"
        ),
    )


def register(subparsers, common):
    parser = subparsers.add_parser(
        "material",
        help="素材库统计 / 明细查询（count / list / list-all）",
        description=(
            "对接 dataservice-api material/pool/*（GET，域名 dataservice-api.dw.alibaba-inc.com）。\n"
            "count：按 item_id × material_type 聚合统计，不支持 --item-ids。\n"
            "list / list-all：按 --item-ids 查明细；共享 pool/宽高/版位/规格/承接页过滤。"
        ),
    )
    sub = parser.add_subparsers(dest="material_action", required=True, title="动作", metavar="<action>")

    # ---- count ----
    count = sub.add_parser(
        "count",
        parents=[common],
        help="按 (商品 id, 素材类型) 维度统计当前素材库的素材数量",
        description=(
            "对接 GET dataservice-api/material/pool/count。\n"
            "返回 data 为 nested map: { itemId -> { materialType -> 数量 } }；"
            "无商品素材的 itemId 以 key=\"\" 表示。\n"
            "不支持 --item-ids；按 pool + 宽高/版位/规格/承接页过滤后，"
            "对库内各 item_id 聚合统计（与 list 的 itemIds 语义不同）。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli material count --media KUAISHOU --pool-id 79626\n"
            "  qihang-cli material count --media KUAISHOU --pool-ids 79626 80700\n"
            "  qihang-cli material count --media KUAISHOU --pool-id 79626 \\\n"
            "      --inventory-names OPEN_SCREEN ENCOURAGE_VIDEO \\\n"
            "      --material-spec-names VERTICAL_VIDEO HORIZONTAL_VIDEO\n"
            "  qihang-cli material count --media KUAISHOU --pool-id 79626 \\\n"
            "      --delivery-page-id landing_v2_660 --output-file ./count.json\n"
            "\n"
            "查库内全部明细的工作流：先 count 拿 itemId 列表，再 list-all --item-ids <ids...>"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    _add_common_filter_flags(count)
    count.set_defaults(func=handle_count)

    # ---- list ----
    list_p = sub.add_parser(
        "list",
        parents=[common],
        help="按商品 id 列表查询素材明细，支持分页 / fields 自定义返回",
        description=(
            "对接 GET dataservice-api/material/pool/list。\n"
            "返回 {data, page, pageSize, hasNext, total}；单页最大 500。\n"
            "--item-ids 必填；规则见 --item-ids help。\n"
            "--not-null-fields 为客户端后置过滤（在当页/已拉取 rows 上剔除空字段行，"
            "不改变服务端 total/hasNext）。\n"
            "带 --output-file 时 stdout 摘要含 total/hasNext/page/pageSize，避免 agent 误以为已拉全。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli material list --media KUAISHOU --pool-id 79626 \\\n"
            "      --item-ids 975460280575 --page-size 10\n"
            "  # 只查无商品素材\n"
            "  qihang-cli material list --media KUAISHOU --pool-id 80700 \\\n"
            "      --item-ids NULL --page-size 10\n"
            "  # 指定商品 + 无商品素材\n"
            "  qihang-cli material list --media KUAISHOU --pool-id 79626 \\\n"
            "      --item-ids 975460280575 NULL --page-size 10\n"
            "  qihang-cli material list --media KUAISHOU --pool-id 79626 \\\n"
            "      --item-ids 975460280575 --page-size 3 --fields SIGNATURE URL WIDTH HEIGHT\n"
            "  qihang-cli material list --media KUAISHOU --pool-id 79626 \\\n"
            "      --item-ids 975460280575 --page-size 200 --output-file ./materials.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    _add_common_filter_flags(list_p)
    _add_item_ids_flag(list_p, required=True)
    _add_not_null_fields_flag(list_p)
    _add_pagination_flags(list_p)
    list_p.set_defaults(func=handle_list)

    # ---- list-all ----
    list_all = sub.add_parser(
        "list-all",
        parents=[common],
        help="按商品 id 列表一把拉全（自动分页循环；强烈建议带 --output-file）",
        description=(
            "对接 GET dataservice-api/material/pool/list，"
            f"cli 自动按 {c.SERVER_MAX_PAGE_SIZE}/页循环至末页。"
            "不用传 --page / --page-size；返回 {data, pagesFetched, total}。\n"
            "--item-ids / --not-null-fields 语义同 list。"
            "强烈建议 --output-file（大数据量）；stdout 摘要含 total/pagesFetched。\n"
            "--dry-run 仅展示第一次请求的 URL（实际执行会从 pageNum=1 循环）。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli material list-all --media KUAISHOU --pool-id 80700 \\\n"
            "      --item-ids NULL --output-file /tmp/no_item.json\n"
            "  qihang-cli material list-all --media KUAISHOU --pool-id 79626 \\\n"
            "      --item-ids 975460280575 --fields SIGNATURE URL --output-file /tmp/m.json\n"
            "  # 多库并集 + 多商品 id\n"
            "  qihang-cli material list-all --media KUAISHOU --pool-ids 79626 80700 \\\n"
            "      --item-ids 975460280575 NULL --output-file /tmp/mixed.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    _add_common_filter_flags(list_all)
    _add_item_ids_flag(list_all, required=True)
    _add_not_null_fields_flag(list_all)
    _add_fields_flag(list_all)
    list_all.set_defaults(func=handle_list_all)


def _add_fields_flag(p: argparse.ArgumentParser) -> None:
    p.add_argument(
        "--fields",
        nargs="+",
        choices=c.MATERIAL_FIELDS,
        help=(
            "希望返回的字段子集；不传或空表示返回全部 11 字段。"
            f" 候选: {c.MATERIAL_FIELDS}"
        ),
    )


def _add_not_null_fields_flag(p: argparse.ArgumentParser) -> None:
    """客户端 not-null 过滤，仅 list / list-all 可用（count 接口 row 仅含 item_id/material_type/material_count，无法做行级判断）。"""
    p.add_argument(
        "--not-null-fields",
        nargs="+",
        choices=c.NOT_NULL_FIELDS,
        dest="not_null_fields",
        help=(
            "客户端后置过滤：剔除指定字段为 null 的行（候选见 choices）。"
            "仅影响返回 data 条数，不改变服务端 total/hasNext"
        ),
    )


# ---------------------------------------------------------------------------
# Item-ID 规范化
# ---------------------------------------------------------------------------

_NULL_ITEM_LITERALS = {"NULL", "NONE", "NIL", "~", ""}


def _normalize_item_ids(raw_ids: list[str] | None) -> list[str | None] | None:
    if not raw_ids:
        return None
    out: list[str | None] = []
    for v in raw_ids:
        stripped = (v or "").strip()
        if stripped.upper() in _NULL_ITEM_LITERALS:
            if stripped != "NULL":
                eprint(f'[hint] --item-ids {v!r} 识别为"无商品"标记；推荐统一写 NULL')
            out.append(None)
        else:
            out.append(stripped)
    return out


# ---------------------------------------------------------------------------
# 字段映射：CLI 枚举名 → dataservice-api 响应字段名
# ---------------------------------------------------------------------------

_FIELD_TO_RESPONSE_KEY: dict[str, str] = {
    "SIGNATURE": "signature",
    "MATERIAL_NAME": "material_name",
    "MATERIAL_TYPE": "material_type",
    "ITEM_ID": "item_id",
    "URL": "material_url",
    "POSTER_URL": "poster_url",
    "ITEM_PIC_URL": "pict_url",
    "WIDTH": "width",
    "HEIGHT": "height",
    "INVENTORY_NAME": "inventory_name",
    "MATERIAL_SPEC_NAME": "material_spec_name",
}

_NOT_NULL_FIELD_TO_KEY: dict[str, str] = {
    "URL": "material_url",
    "POSTER_URL": "poster_url",
    "ITEM_PIC_URL": "pict_url",
    "WIDTH": "width",
    "HEIGHT": "height",
}


# ---------------------------------------------------------------------------
# dataservice-api HTTP helper
# ---------------------------------------------------------------------------

def _request_material_pool(path: str, params: dict[str, str], timeout: int = 180) -> dict:
    """GET 请求 dataservice-api material pool 接口。"""
    url = c.MATERIAL_POOL_DS_BASE_URL.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "qihang-cli"})

    ctx = None
    if os.getenv("PYTHONHTTPSVERIFY") == "0":
        ctx = ssl._create_unverified_context()

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace") if exc.fp else str(exc)
        raise QihangApiError(f"HTTP {exc.code}: {detail[:500]}", method=path)
    except urllib.error.URLError as exc:
        raise QihangApiError(f"网络错误: {exc.reason}", method=path)

    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise QihangApiError(f"响应不是合法 JSON: {raw[:300]}", method=path)


def _check_ds_response(resp: dict, context: str = "") -> None:
    """校验 dataservice-api 响应，errCode != 0 时抛 CliError。"""
    if resp.get("errCode") != 0:
        raise CliError(f"API 错误{context}: {resp.get('errMsg', 'unknown')}")


# ---------------------------------------------------------------------------
# 参数构建
# ---------------------------------------------------------------------------

def _build_base_params(args) -> dict[str, str]:
    """构建 dataservice-api GET 请求公共 query 参数。"""
    params: dict[str, str] = {
        "appCode": c.MATERIAL_POOL_DS_APP_CODE,
        "media": args.media,
        "poolIds": ",".join(str(pid) for pid in args.pool_ids),
    }
    if args.min_width is not None:
        params["minWidth"] = str(args.min_width)
    if args.max_width is not None:
        params["maxWidth"] = str(args.max_width)
    if args.min_height is not None:
        params["minHeight"] = str(args.min_height)
    if args.max_height is not None:
        params["maxHeight"] = str(args.max_height)
    if args.inventory_names:
        params["inventoryNames"] = ",".join(args.inventory_names)
    if args.material_spec_names:
        params["materialSpecNames"] = ",".join(args.material_spec_names)
    if args.delivery_page_id:
        params["deliveryPageId"] = args.delivery_page_id
    return params


def _apply_item_ids_to_params(params: dict[str, str], raw_item_ids: list[str] | None) -> None:
    """将 --item-ids 转换为 dataservice-api 的 itemIds + includeNullItemId 查询参数。"""
    if not raw_item_ids:
        params["includeNullItemId"] = "true"
        return
    normalized = _normalize_item_ids(raw_item_ids)
    non_null = [v for v in (normalized or []) if v is not None]
    has_null = any(v is None for v in (normalized or []))
    if non_null:
        params["itemIds"] = ",".join(non_null)
    params["includeNullItemId"] = "true" if has_null or not non_null else "false"


# ---------------------------------------------------------------------------
# 客户端 post-filter / 投影
# ---------------------------------------------------------------------------

def _apply_not_null_filter(rows: list[dict], not_null_fields: list[str] | None) -> list[dict]:
    """客户端过滤：剔除指定字段为 null 的行。"""
    if not not_null_fields:
        return rows
    keys = [_NOT_NULL_FIELD_TO_KEY.get(f, f.lower()) for f in not_null_fields]
    return [row for row in rows if all(row.get(k) is not None for k in keys)]


def _apply_fields_projection(rows: list[dict], fields: list[str] | None) -> list[dict]:
    """客户端字段投影：仅保留 --fields 指定的字段。"""
    if not fields:
        return rows
    keys = {_FIELD_TO_RESPONSE_KEY.get(f, f.lower()) for f in fields}
    return [{k: v for k, v in row.items() if k in keys} for row in rows]


def _assert_page_size(page_size: int | None) -> None:
    if page_size is None or page_size <= 0:
        raise CliError("--page-size 必须为正整数")
    if page_size > c.SERVER_MAX_PAGE_SIZE:
        raise CliError(
            f"--page-size 最大 {c.SERVER_MAX_PAGE_SIZE}；想一次拉全用 list-all"
        )


def _ds_url(path: str, params: dict[str, str]) -> str:
    """拼出完整 URL（仅用于 dry-run 展示）。"""
    url = c.MATERIAL_POOL_DS_BASE_URL.rstrip("/") + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return url


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def handle_count(args, client):
    params = _build_base_params(args)
    _apply_item_ids_to_params(params, getattr(args, "item_ids", None))
    params["returnTotalNum"] = "true"
    params["pageNum"] = "1"
    params["pageSize"] = "10000"

    if args.dry_run:
        print_request_dryrun("GET", _ds_url(c.MATERIAL_POOL_DS_COUNT_PATH, params), {})
        return

    timeout = getattr(client, "timeout", 180) or 180
    resp = _request_material_pool(c.MATERIAL_POOL_DS_COUNT_PATH, params, timeout=timeout)
    _check_ds_response(resp)

    data = resp.get("data") or {}
    rows = data.get("rows") or []
    # 转为与老接口兼容的 nested map: {itemId: {materialType: count}}
    result_map: dict[str, dict] = {}
    for row in rows:
        item_id = str(row.get("item_id") or "")
        mt = str(row.get("material_type", ""))
        count = row.get("material_count", 0)
        result_map.setdefault(item_id, {})[mt] = count
    output_result({"successful": True, "data": result_map}, output_file=args.output_file, fmt=args.output)


def handle_list(args, client):
    if not args.item_ids:
        raise CliError("--item-ids 不能为空")
    _assert_page_size(args.page_size)

    params = _build_base_params(args)
    _apply_item_ids_to_params(params, args.item_ids)
    params["returnTotalNum"] = "true"
    params["pageNum"] = str(args.page)
    params["pageSize"] = str(args.page_size)

    if args.dry_run:
        print_request_dryrun("GET", _ds_url(c.MATERIAL_POOL_DS_LIST_PATH, params), {})
        return

    timeout = getattr(client, "timeout", 180) or 180
    resp = _request_material_pool(c.MATERIAL_POOL_DS_LIST_PATH, params, timeout=timeout)
    _check_ds_response(resp)

    data = resp.get("data") or {}
    rows = data.get("rows") or []
    total_num = data.get("totalNum")
    page_num = data.get("pageNum", 1)
    page_size = data.get("pageSize", args.page_size)

    rows = _apply_not_null_filter(rows, getattr(args, "not_null_fields", None))
    rows = _apply_fields_projection(rows, getattr(args, "fields", None))

    has_next = (page_num * page_size < total_num) if total_num is not None else False
    result = {
        "successful": True,
        "data": rows,
        "page": page_num,
        "pageSize": page_size,
        "total": total_num,
        "hasNext": has_next,
    }
    output_result(result, output_file=args.output_file, fmt=args.output)


# 防服务端异常时死循环
_MAX_LIST_ALL_PAGES = 1000


def handle_list_all(args, client):
    if not args.item_ids:
        raise CliError("--item-ids 不能为空")

    params = _build_base_params(args)
    _apply_item_ids_to_params(params, args.item_ids)
    params["returnTotalNum"] = "true"
    params["pageSize"] = str(c.SERVER_MAX_PAGE_SIZE)

    timeout = getattr(client, "timeout", 180) or 180

    if args.dry_run:
        params["pageNum"] = "1"
        print_request_dryrun("GET", _ds_url(c.MATERIAL_POOL_DS_LIST_PATH, params), {
            "_note": "实际执行时 cli 会从 pageNum=1 循环拉取直到末页；本 dry-run 仅展示第一次请求",
        })
        return

    all_rows: list = []
    total = None
    page = 1
    while True:
        params["pageNum"] = str(page)
        resp = _request_material_pool(c.MATERIAL_POOL_DS_LIST_PATH, params, timeout=timeout)
        _check_ds_response(resp, context=f" (page {page})")

        data = resp.get("data") or {}
        rows = data.get("rows") or []
        all_rows.extend(rows)

        if page == 1:
            total = data.get("totalNum")
            if total is not None:
                expected_pages = (total + c.SERVER_MAX_PAGE_SIZE - 1) // c.SERVER_MAX_PAGE_SIZE
                eprint(f"[list-all] total={total}, 单页 {c.SERVER_MAX_PAGE_SIZE}，约 {expected_pages} 页")

        page_size = data.get("pageSize", c.SERVER_MAX_PAGE_SIZE)
        if total is not None and page * page_size >= total:
            break
        if not rows:
            break
        page += 1
        if page > _MAX_LIST_ALL_PAGES:
            raise CliError(
                f"page > {_MAX_LIST_ALL_PAGES}，疑似分页异常，已终止；已拉取 {len(all_rows)} 条"
            )

    all_rows = _apply_not_null_filter(all_rows, getattr(args, "not_null_fields", None))
    all_rows = _apply_fields_projection(all_rows, getattr(args, "fields", None))

    summary = {
        "successful": True,
        "data": all_rows,
        "pagesFetched": page,
        "total": total if total is not None else len(all_rows),
    }
    output_result(summary, output_file=args.output_file, fmt=args.output)
