#!/usr/bin/env python3
"""Top-level argparse tree for the Kuaishou MAPI CLI.

token 策略：CLI 本身不获取 token，请求 `Access-Token` 字段固定填占位符 `<token>`，
真实 token 由上游代理在发送前替换。`--token VALUE` 全局 flag 仅用于排查问题：
传了就把占位符覆盖成 VALUE，让 CLI 直接发出可执行的请求。
"""

from __future__ import annotations

import os

import argparse

from . import __version__
from .client import KuaishouApiError, KuaishouClient
from .config import KuaishouConfig
from .io_utils import CliError, eprint
from .validators import ValidationError
from .commands import account, campaign, creative, material, native, unit


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kuaishou-cli",
        description="Kuaishou MAPI CLI.",
    )
    parser.add_argument("--version", action="version", version=f"kuaishou-cli {__version__}")
    parser.add_argument(
        "--output",
        choices=["json", "table", "raw"],
        default="json",
        help="输出格式（默认 json）",
    )
    parser.add_argument("--advertiser-id", dest="global_advertiser_id", help="广告主 advertiser_id")
    parser.add_argument(
        "--token",
        dest="global_token",
        default=None,
        help=(
            "覆盖默认 token 占位符 <token>（仅排查问题时用）。"
            "默认情况下 CLI 发出的请求 Access-Token 字段是 <token>，由上游代理替换为真 token；"
            "本 flag 让你直接传真 token，让 CLI 发出可执行的请求。"
        ),
    )
    parser.add_argument("--base-url", dest="global_base_url", default=None, help="覆盖默认 API base URL")
    parser.add_argument("--timeout", dest="global_timeout", type=int, default=None, help="请求超时秒数（默认 30）")

    subparsers = parser.add_subparsers(
        dest="command",
        required=True,
        title="可用子命令",
        metavar="<command>",
    )
    account.register(subparsers)
    campaign.register(subparsers)
    unit.register(subparsers)
    material.register(subparsers)
    creative.register(subparsers)
    native.register(subparsers)
    return parser


def _build_config(args) -> KuaishouConfig:
    """从 CLI 参数直接构建 KuaishouConfig，不读取任何配置文件。"""
    cfg = KuaishouConfig(
        access_token=args.global_token or os.getenv("KUAISHOU_ACCESS_TOKEN") or KuaishouConfig.access_token,
        advertiser_id=args.global_advertiser_id,
        base_url=args.global_base_url,
        timeout=args.global_timeout if args.global_timeout is not None else KuaishouConfig.timeout,
    )
    # 子命令级 --advertiser-id 优先；若未传则用全局值
    if not getattr(args, "advertiser_id", None) and cfg.advertiser_id:
        setattr(args, "advertiser_id", cfg.advertiser_id)
    return cfg


def _build_client(args) -> KuaishouClient:
    cfg = _build_config(args)
    return KuaishouClient(cfg)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        client = _build_client(args)
        args.func(args, client)
        return 0
    except (CliError, ValidationError, KuaishouApiError) as exc:
        eprint(f"Error: {exc}")
        return 2
    except KeyboardInterrupt:
        eprint("Interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
