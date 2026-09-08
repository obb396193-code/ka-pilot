"""HTTP client for Algorithm data service (urllib stdlib only)."""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from . import __version__
from .config import AlgorithmConfig


class AlgorithmApiError(RuntimeError):
    def __init__(self, message: str, *, path: str | None = None, params: dict[str, str] | None = None):
        self.path = path
        self.params = params or {}
        super().__init__(message)


class AlgorithmClient:
    def __init__(self, config: AlgorithmConfig):
        self.config = config
        self.base_url = (config.base_url or "").rstrip("/")
        self.timeout = config.timeout
        self.app_code = config.app_code

    def url_for(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        return self.base_url + "/" + path.lstrip("/")

    def request_get(self, path: str, params: dict[str, str]) -> dict[str, Any]:
        url = self.url_for(path)
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": f"algorithm-cli/{__version__}"},
            method="GET",
        )

        ctx = None
        if os.getenv("PYTHONHTTPSVERIFY") == "0":
            ctx = ssl._create_unverified_context()

        try:
            with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as resp:
                raw = resp.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            try:
                detail = exc.read().decode("utf-8", errors="replace")
            except Exception:
                detail = str(exc)
            raise AlgorithmApiError(
                f"HTTP {exc.code} {exc.reason}: {detail[:500]}",
                path=path,
                params=params,
            ) from exc
        except urllib.error.URLError as exc:
            raise AlgorithmApiError(f"网络错误: {exc.reason}", path=path, params=params) from exc

        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise AlgorithmApiError(
                f"响应不是合法 JSON: {raw[:300]}",
                path=path,
                params=params,
            ) from exc

        err_code = parsed.get("errCode")
        if err_code not in (None, 0):
            err_msg = parsed.get("errMsg") or parsed.get("message") or "unknown error"
            raise AlgorithmApiError(
                f"API errCode={err_code}: {err_msg}",
                path=path,
                params=params,
            )

        return parsed
