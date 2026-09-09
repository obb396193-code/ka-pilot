"""HTTP client for Qihang Kuaishou OpenAPI (urllib stdlib only)."""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from . import __version__
from .config import QihangConfig


class QihangApiError(RuntimeError):
    def __init__(self, message: str, *, method: str | None = None, payload: dict[str, Any] | None = None):
        self.method = method
        self.payload = payload or {}
        super().__init__(message)


@dataclass
class PreparedRequest:
    url: str
    method: str
    headers: dict[str, str]
    body: Any


class QihangClient:
    def __init__(self, config: QihangConfig):
        self.config = config
        self.base_url = (config.base_url or "").rstrip("/") + "/"
        self.timeout = config.timeout

    # -------- URL / 请求构造 --------

    def url_for(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            return path
        return urllib.parse.urljoin(self.base_url, path.lstrip("/"))

    def headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json;charset=UTF-8",
            "User-Agent": f"qihang-ks-cli/{__version__}",
        }

    def prepare(self, path: str, payload: dict[str, Any]) -> PreparedRequest:
        return PreparedRequest(
            url=self.url_for(path),
            method="POST",
            headers=self.headers(),
            body=payload,
        )

    # -------- 实际 HTTP --------

    def request_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        prepared = self.prepare(path, payload)
        body_bytes = json.dumps(prepared.body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            prepared.url,
            data=body_bytes,
            headers=prepared.headers,
            method=prepared.method,
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
            raise QihangApiError(
                f"HTTP {exc.code} {exc.reason}: {detail[:500]}",
                method=path,
                payload=payload,
            ) from exc
        except urllib.error.URLError as exc:
            raise QihangApiError(f"网络错误: {exc.reason}", method=path, payload=payload) from exc

        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise QihangApiError(
                f"响应不是合法 JSON: {raw[:300]}",
                method=path,
                payload=payload,
            ) from exc

        return parsed

    def request_get(self, path: str, params: dict[str, str]) -> dict[str, Any]:
        url = self.url_for(path)
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": f"qihang-ks-cli/{__version__}"},
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
            raise QihangApiError(
                f"HTTP {exc.code} {exc.reason}: {detail[:500]}",
                method=path,
            ) from exc
        except urllib.error.URLError as exc:
            raise QihangApiError(f"网络错误: {exc.reason}", method=path) from exc

        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError as exc:
            raise QihangApiError(
                f"响应不是合法 JSON: {raw[:300]}",
                method=path,
            ) from exc

        return parsed
