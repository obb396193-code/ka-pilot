"""I/O helpers for qihang-ks-cli.

核心：output_result() 根据 --output-file 决定 stdout 行为：
- 没传 → 直接打 JSON 全文（agent 上下文模式）
- 传了 → 文件落盘 + stdout 只回摘要 {savedTo,count,preview前3条,successful}
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


class CliError(RuntimeError):
    pass


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False))


def eprint(message: str) -> None:
    print(message, file=sys.stderr)


def _extract_data_count_and_preview(value: Any) -> tuple[int, Any]:
    """从响应中抽 count + preview（前 3 条 / 前 3 个 entry）。"""
    if not isinstance(value, dict):
        return (0, None)
    data = value.get("data")
    if isinstance(data, list):
        return (len(data), data[:3])
    if isinstance(data, dict):
        items = list(data.items())
        return (len(items), dict(items[:3]))
    return (0, data)


def _ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def output_result(value: Any, *, output_file: str | None = None, fmt: str = "json") -> None:
    """统一输出策略。

    - output_file 不传：JSON 直打 stdout（agent 直接读上下文）
    - output_file 传了：完整响应写文件，stdout 仅回摘要
    """
    if output_file:
        target = Path(output_file).expanduser().resolve()
        _ensure_parent_dir(target)
        target.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False),
            encoding="utf-8",
        )
        count, preview = _extract_data_count_and_preview(value)
        successful = bool(value.get("successful")) if isinstance(value, dict) else None
        message = value.get("message") if isinstance(value, dict) else None
        summary: dict[str, Any] = {
            "savedTo": str(target),
            "successful": successful,
            "count": count,
            "preview": preview,
        }
        if successful is False and message:
            summary["message"] = message
        print_json(summary)
        return

    if fmt == "raw":
        print(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))
        return

    print_json(value)


def print_request_dryrun(method: str, url: str, payload: Any) -> None:
    """--dry-run 输出格式：方法 + url + 请求体。"""
    body = {
        "dryRun": True,
        "request": {"method": method, "url": url, "body": payload},
    }
    print_json(body)
