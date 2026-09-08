#!/usr/bin/env python3
"""Top-level argparse tree for the Qihang OpenAPI CLI."""

from __future__ import annotations

import argparse

from . import __version__
from .client import QihangApiError, QihangClient
from .config import QihangConfig
from .io_utils import CliError, eprint
from .commands import account, link, material, textpool


def make_common_options_parser() -> argparse.ArgumentParser:
    """共享给顶层 parser 和每个 action 子 parser 的全局 flag。"""
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument(
        "--base-url",
        dest="global_base_url",
        help=(
            "覆盖启航 OpenAPI base URL（默认 https://qh.alibaba-inc.com，可改预发 "
            "https://pre-xhl-qh3.alibaba-inc.com）。仅 link 等走启航域名的子命令生效；"
            "material / textpool / account 直连 dataservice-api，忽略本参数"
        ),
    )
    p.add_argument("--timeout", type=int, dest="global_timeout", help="HTTP 超时秒数（默认 180）")
    p.add_argument(
        "--output",
        choices=["json", "raw"],
        default="json",
        help="stdout 输出格式（默认 json）",
    )
    p.add_argument(
        "--output-file",
        dest="output_file",
        help=(
            "把完整响应写入指定路径，stdout 仅回摘要（适合 agent 大数据量场景）。"
            "material list/list-all 摘要含 total/hasNext/page/pageSize（或 pagesFetched）；"
            "link build 摘要含 savedTo/total/success/failed；其余子命令见各 action --help"
        ),
    )
    return p


def build_parser() -> argparse.ArgumentParser:
    common = make_common_options_parser()
    parser = argparse.ArgumentParser(
        prog="qihang-cli",
        description=(
            "Qihang OpenAPI CLI（通用）。\n"
            "  material   素材库统计 / 明细查询（dataservice-api material/pool/*）\n"
            "  link       启航链接生成（qh.alibaba-inc.com）\n"
            "  textpool   文案库查询（dataservice-api）\n"
            "  account    账户权限查询（private-dataservice-api）\n"
            "快手专属能力（版位查规格 / 素材共享 / 账户复制 / 快手任务配置）请使用 qihang-ks-cli。\n"
            "每个子命令的详情见 `qihang-cli <command> <action> --help`。"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[common],
    )
    parser.add_argument("--version", action="version", version=f"qihang-cli {__version__}")

    subparsers = parser.add_subparsers(
        dest="command",
        required=True,
        title="可用子命令",
        metavar="<command>",
    )
    material.register(subparsers, common)
    link.register(subparsers, common)
    textpool.register(subparsers, common)
    account.register(subparsers, common)
    return parser


def _build_config(args) -> QihangConfig:
    """从 CLI 参数直接构建 QihangConfig，不读取任何配置文件。"""
    return QihangConfig(
        base_url=args.global_base_url or QihangConfig.base_url,
        timeout=args.global_timeout if args.global_timeout is not None else QihangConfig.timeout,
    )


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        cfg = _build_config(args)
        client = QihangClient(cfg)
        args.func(args, client)
        return 0
    except (CliError, QihangApiError) as exc:
        eprint(f"Error: {exc}")
        return 2
    except KeyboardInterrupt:
        eprint("Interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
