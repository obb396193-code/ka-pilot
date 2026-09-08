"""Shared helpers for algorithm-cli query commands."""

from __future__ import annotations

import argparse
from typing import Any


def add_ds_flag(p: argparse.ArgumentParser) -> None:
    p.add_argument("--ds", required=True, help="分区日期（必填，格式 yyyyMMdd）")


def add_pagination_flags(p: argparse.ArgumentParser, *, default_page_size: int) -> None:
    p.add_argument("--page", type=int, default=1, help="页码 pageNum（默认 1）")
    p.add_argument(
        "--page-size",
        type=int,
        default=default_page_size,
        dest="page_size",
        help=f"每页条数 pageSize（默认 {default_page_size}）",
    )
    p.add_argument(
        "--no-total",
        action="store_true",
        help="不返回总数 returnTotalNum=false（默认返回总数）",
    )


def add_optional_string_flag(p: argparse.ArgumentParser, api_name: str, cli_name: str, help_text: str) -> None:
    p.add_argument(
        f"--{cli_name}",
        default="",
        dest=api_name,
        help=help_text,
    )


def build_base_params(args, client) -> dict[str, str]:
    params = {
        "appCode": client.app_code,
        "returnTotalNum": "false" if args.no_total else "true",
        "pageNum": str(args.page),
        "pageSize": str(args.page_size),
    }
    if getattr(args, "ds", None) is not None:
        params["ds"] = str(args.ds)
    return params


def merge_optional_params(params: dict[str, str], mapping: dict[str, Any]) -> dict[str, str]:
    for api_key, value in mapping.items():
        if value is None:
            continue
        text = str(value).strip()
        if text:
            params[api_key] = text
        else:
            params[api_key] = ""
    return params
