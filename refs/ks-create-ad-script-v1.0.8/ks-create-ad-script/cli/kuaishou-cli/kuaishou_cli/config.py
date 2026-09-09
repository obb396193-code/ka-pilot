"""Configuration for the Kuaishou CLI."""

from __future__ import annotations

from dataclasses import dataclass


TOKEN_PLACEHOLDER = "<token>"


@dataclass(frozen=True)
class KuaishouConfig:
    access_token: str = TOKEN_PLACEHOLDER
    advertiser_id: str | None = None
    base_url: str | None = None
    timeout: int = 30
