"""Configuration for the Qihang Kuaishou CLI."""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_BASE_URL = "https://qh.alibaba-inc.com"


@dataclass(frozen=True)
class QihangConfig:
    base_url: str = DEFAULT_BASE_URL
    timeout: int = 180
