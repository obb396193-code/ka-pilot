"""将 load 阶段产出的 List<map> JSON 读入 pandas DataFrame（模块名避免与标准库 io 冲突）。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd


def load_records_json(path: str | Path) -> pd.DataFrame:
    """
    读取 JSON 数组文件（每元素为一条 dict），转为 DataFrame。
    空数组得到空 DataFrame。
    """
    p = Path(path).expanduser()
    raw = p.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("JSON 顶层必须是数组（List<map>）")
    if not data:
        return pd.DataFrame()
    if not all(isinstance(x, dict) for x in data):
        raise ValueError("数组元素必须为对象")
    return pd.DataFrame(data)


def records_to_dataframe(records: list[dict[str, Any]]) -> pd.DataFrame:
    """内存中的 list[dict] 转 DataFrame。"""
    if not records:
        return pd.DataFrame()
    return pd.DataFrame(records)
