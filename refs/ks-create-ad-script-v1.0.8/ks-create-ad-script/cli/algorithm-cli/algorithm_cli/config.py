"""Algorithm CLI configuration loading.

支持优先级（高 → 低）：
  CLI flag (--base-url/--timeout) → 环境变量 → ~/.algorithm/config.json profile → 内置默认。
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path.home() / ".algorithm" / "config.json"


@dataclass(frozen=True)
class AlgorithmConfig:
    profile: str
    base_url: str
    app_code: str
    timeout: int = 180


class ConfigError(RuntimeError):
    pass


def load_config(path: str | None = None, profile: str = "default") -> AlgorithmConfig:
    config_path = Path(path).expanduser() if path else DEFAULT_CONFIG_PATH
    data: dict[str, Any] = {}
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ConfigError(f"配置文件不是合法 JSON: {config_path}: {exc}") from exc

    profiles = data.get("profiles", {}) if isinstance(data, dict) else {}
    profile_data = profiles.get(profile, {}) if isinstance(profiles, dict) else {}
    if not isinstance(profile_data, dict):
        raise ConfigError(f"profile 配置必须是对象: {profile}")

    from . import constants as c

    base_url = (
        os.getenv("ALGORITHM_BASE_URL")
        or profile_data.get("base_url")
        or data.get("base_url")
        or c.BASE_URL
    )
    app_code = (
        os.getenv("ALGORITHM_APP_CODE")
        or profile_data.get("app_code")
        or data.get("app_code")
        or c.APP_CODE
    )
    timeout_value = (
        os.getenv("ALGORITHM_TIMEOUT")
        or profile_data.get("timeout")
        or data.get("timeout")
        or 180
    )
    try:
        timeout = int(timeout_value)
    except (TypeError, ValueError):
        timeout = 180

    return AlgorithmConfig(
        profile=profile,
        base_url=str(base_url),
        app_code=str(app_code),
        timeout=timeout,
    )
