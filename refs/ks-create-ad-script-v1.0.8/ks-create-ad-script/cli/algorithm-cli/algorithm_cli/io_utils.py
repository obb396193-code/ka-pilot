"""I/O helpers for algorithm-cli."""

from __future__ import annotations

import json
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
    """从 dataservice 分页响应中抽 count + preview。"""
    if not isinstance(value, dict):
        return (0, None)
    data = value.get("data")
    if isinstance(data, dict):
        rows = data.get("rows")
        if isinstance(rows, list):
            total = data.get("totalNum")
            count = int(total) if total is not None else len(rows)
            return (count, rows[:3])
        return (0, data)
    if isinstance(data, list):
        return (len(data), data[:3])
    return (0, data)


def _ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def output_result(value: Any, *, output_file: str | None = None, fmt: str = "json") -> None:
    if output_file:
        target = Path(output_file).expanduser().resolve()
        _ensure_parent_dir(target)
        target.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False),
            encoding="utf-8",
        )
        count, preview = _extract_data_count_and_preview(value)
        err_code = value.get("errCode") if isinstance(value, dict) else None
        err_msg = value.get("errMsg") if isinstance(value, dict) else None
        summary: dict[str, Any] = {
            "savedTo": str(target),
            "errCode": err_code,
            "count": count,
            "preview": preview,
        }
        if err_msg:
            summary["errMsg"] = err_msg
        print_json(summary)
        return

    if fmt == "raw":
        print(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False))
        return

    print_json(value)
