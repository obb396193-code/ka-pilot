"""I/O helpers for Kuaishou CLI."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


class CliError(RuntimeError):
    pass


def read_json_file(path: str) -> dict[str, Any]:
    try:
        return json.loads(Path(path).expanduser().read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CliError(f"文件不存在: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CliError(f"JSON 文件格式错误: {path}: {exc}") from exc


def parse_json_arg(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise CliError(f"--json 不是合法 JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise CliError("--json 必须是 JSON object")
    return parsed


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False))


def output_result(value: Any, fmt: str = "json") -> None:
    if fmt == "json":
        print_json(value)
        return
    if fmt == "raw":
        print(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))
        return
    if fmt == "table":
        print_table(value)
        return
    raise CliError(f"不支持的输出格式: {fmt}")


def print_table(value: Any) -> None:
    rows = None
    if isinstance(value, dict):
        data = value.get("data")
        if isinstance(data, dict):
            rows = data.get("details") or data.get("data") or data.get("list")
        elif isinstance(data, list):
            rows = data
    elif isinstance(value, list):
        rows = value
    if not rows or not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        print_json(value)
        return
    keys: list[str] = []
    for row in rows[:50]:
        for key in row.keys():
            if key not in keys:
                keys.append(key)
            if len(keys) >= 8:
                break
        if len(keys) >= 8:
            break
    widths = {k: max(len(k), *(len(str(r.get(k, ""))) for r in rows[:50])) for k in keys}
    print("  ".join(k.ljust(widths[k]) for k in keys))
    print("  ".join("-" * widths[k] for k in keys))
    for row in rows:
        print("  ".join(str(row.get(k, "")).ljust(widths[k]) for k in keys))


def eprint(message: str) -> None:
    print(message, file=sys.stderr)
