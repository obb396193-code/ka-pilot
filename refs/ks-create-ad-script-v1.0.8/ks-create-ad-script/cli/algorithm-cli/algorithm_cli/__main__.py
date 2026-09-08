#!/usr/bin/env python3
"""Top-level argparse tree for the Algorithm data service CLI."""

from __future__ import annotations

import argparse
from dataclasses import replace

from . import __version__
from .client import AlgorithmApiError, AlgorithmClient
from .config import ConfigError, load_config
from .io_utils import CliError, eprint
from .commands import data, info, material


def make_common_options_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--profile", default="default", help="本地配置 profile 名称（默认 default）")
    p.add_argument("--config", help="自定义配置文件路径，默认 ~/.algorithm/config.json")
    p.add_argument(
        "--base-url",
        dest="global_base_url",
        help="覆盖 dataservice base URL（默认 private-dataservice-api.dw.alibaba-inc.com）",
    )
    p.add_argument(
        "--app-code",
        dest="global_app_code",
        help="覆盖 appCode（默认内置 E1A16AAC...）",
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
            "把响应完整 JSON 写入指定路径，stdout 仅回摘要 "
            "{savedTo,count,preview前3条,errCode}；适合 agent 大数据量场景"
        ),
    )
    return p


def build_parser() -> argparse.ArgumentParser:
    common = make_common_options_parser()
    parser = argparse.ArgumentParser(
        prog="algorithm-cli",
        description=(
            "Algorithm data service CLI。封装 private-dataservice-api 上的三类查询：\n"
            "动态出价信息 / 算法素材 / 动态投放数据。\n"
            "每个子命令的详情见 `algorithm-cli <command> <action> --help`。"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[common],
    )
    parser.add_argument("--version", action="version", version=f"algorithm-cli {__version__}")

    subparsers = parser.add_subparsers(
        dest="command",
        required=True,
        title="可用子命令",
        metavar="<command>",
    )
    info.register(subparsers, common)
    material.register(subparsers, common)
    data.register(subparsers, common)
    return parser


def _resolve_config(args):
    cfg = load_config(args.config, args.profile)
    base_url = getattr(args, "global_base_url", None)
    app_code = getattr(args, "global_app_code", None)
    timeout = getattr(args, "global_timeout", None)
    if base_url or app_code or timeout is not None:
        cfg = replace(
            cfg,
            base_url=base_url or cfg.base_url,
            app_code=app_code or cfg.app_code,
            timeout=timeout if timeout is not None else cfg.timeout,
        )
    return cfg


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        cfg = _resolve_config(args)
        client = AlgorithmClient(cfg)
        args.func(args, client)
        return 0
    except (CliError, ConfigError, AlgorithmApiError) as exc:
        eprint(f"Error: {exc}")
        return 2
    except KeyboardInterrupt:
        eprint("Interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
