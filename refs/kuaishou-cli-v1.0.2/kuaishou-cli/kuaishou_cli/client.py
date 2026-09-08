"""HTTP client for Kuaishou Marketing API.

token 策略：CLI 自身不获取 token。`Access-Token` / `Authorization` header 默认填
固定占位符 `<token>`，真实 token 由上游代理在发送前替换。`--token VALUE` 全局 flag
仅供问题排查（直接覆盖占位符，发出真实可用的请求）。
"""

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import ssl
import uuid
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import KuaishouConfig, TOKEN_PLACEHOLDER
from .constants import BASE_URL


class KuaishouApiError(RuntimeError):
    def __init__(self, message: str, *, method: str | None = None, payload: dict[str, Any] | None = None):
        self.method = method
        self.payload = payload or {}
        super().__init__(message)


@dataclass
class PreparedRequest:
    url: str
    headers: dict[str, str]
    body: Any
    http_method: str
    content_type: str


class KuaishouClient:
    def __init__(self, config: KuaishouConfig):
        self.config = config
        self.base_url = (config.base_url or BASE_URL).rstrip("/") + "/"
        self.timeout = config.timeout

    def url_for(self, method: str) -> str:
        if method.startswith("http://") or method.startswith("https://"):
            return method
        return urllib.parse.urljoin(self.base_url, method)

    def headers(self, content_type: str = "application/json;charset=UTF-8") -> dict[str, str]:
        token = self.config.access_token or TOKEN_PLACEHOLDER
        return {
            "Access-Token": token,
            "Authorization": token,
            "Content-Type": content_type,
            "x-uniform-currency-unit": "true",
            "User-Agent": "kuaishou-cli/1.2.1",
        }

    def prepare_json(self, method: str, payload: dict[str, Any]) -> PreparedRequest:
        return PreparedRequest(
            url=self.url_for(method),
            headers=self.headers(),
            body=payload,
            http_method="POST",
            content_type="json",
        )

    def request_json(self, method: str, payload: dict[str, Any], *, dry_run: bool = False) -> dict[str, Any]:
        prepared = self.prepare_json(method, payload)
        if dry_run:
            return self._dry_run(method, prepared)

        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(prepared.url, data=body, headers=prepared.headers, method="POST")
        return self._execute(method, request, payload)

    def request_multipart(
        self,
        method: str,
        fields: dict[str, Any],
        *,
        files: dict[str, str] | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        files = files or {}
        boundary = "----kuaishou-cli-" + uuid.uuid4().hex
        headers = self.headers(f"multipart/form-data; boundary={boundary}")
        url = self.url_for(method)
        prepared = PreparedRequest(url=url, headers=headers, body={"fields": fields, "files": files}, http_method="POST", content_type="multipart")
        if dry_run:
            return self._dry_run(method, prepared)

        body = encode_multipart(fields, files, boundary)
        request = urllib.request.Request(url, data=body, headers=headers, method="POST")
        return self._execute(
            method,
            request,
            {**fields, **{k: f"@{v}" for k, v in files.items()}},
        )

    def upload_image(self, payload: dict[str, Any], *, dry_run: bool = False) -> dict[str, Any]:
        from .constants import IMAGE_UPLOAD

        fields = {k: v for k, v in payload.items() if k != "file"}
        files = {"file": payload["file"]} if payload.get("file") else {}
        return self.request_multipart(IMAGE_UPLOAD, fields, files=files, dry_run=dry_run)

    def upload_video(self, payload: dict[str, Any], *, dry_run: bool = False) -> dict[str, Any]:
        from .constants import VIDEO_UPLOAD

        fields = {k: v for k, v in payload.items() if k not in {"file", "url"}}
        file_path = payload.get("file")
        temp_file: Path | None = None
        if payload.get("url") and not file_path:
            if dry_run:
                fields["source_url"] = payload["url"]
                file_path = "<downloaded-from-url>"
            else:
                temp_file = download_to_temp(payload["url"])
                file_path = str(temp_file)
        if file_path and file_path != "<downloaded-from-url>":
            if dry_run:
                fields.setdefault("signature", f"<md5-of-{Path(file_path).name}>")
            else:
                fields.setdefault("signature", md5_file(file_path))
            if "photo_name" not in fields:
                fields["photo_name"] = Path(file_path).stem[:49]
        files = {"file": file_path} if file_path else {}
        try:
            return self.request_multipart(VIDEO_UPLOAD, fields, files=files, dry_run=dry_run)
        finally:
            if temp_file and temp_file.exists():
                temp_file.unlink(missing_ok=True)

    def _execute(
        self,
        method: str,
        request: urllib.request.Request,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        context = None
        if os.getenv("PYTHONHTTPSVERIFY") == "0":
            context = ssl._create_unverified_context()
        try:
            with urllib.request.urlopen(request, timeout=self.timeout, context=context) as response:
                raw = response.read().decode("utf-8", errors="replace")
                status = response.status
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            raise KuaishouApiError(
                f"HTTP 请求失败: status={exc.code}, method={method}, url={request.full_url}\n"
                f"Response: {raw[:2000]}",
                method=method,
                payload=payload,
            ) from exc
        except urllib.error.URLError as exc:
            raise KuaishouApiError(
                f"网络请求失败: method={method}, url={request.full_url}, error={exc}",
                method=method,
                payload=payload,
            ) from exc

        if status < 200 or status >= 300:
            raise KuaishouApiError(
                f"HTTP 请求失败: status={status}, method={method}, url={request.full_url}\n"
                f"Response: {raw[:2000]}",
                method=method,
                payload=payload,
            )
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise KuaishouApiError(
                f"响应不是合法 JSON: method={method}, response={raw[:2000]}",
                method=method,
                payload=payload,
            ) from exc

        code = data.get("code")
        if code is not None and code != 0:
            request_id = data.get("request_id") or data.get("requestId")
            msg = data.get("message") or data.get("msg") or "unknown error"
            raise KuaishouApiError(
                f"快手请求失败: method={method}, code={code}, message={msg}, request_id={request_id}\n"
                f"Payload: {json.dumps(payload, ensure_ascii=False)}",
                method=method,
                payload=payload,
            )
        return data

    def _dry_run(self, method: str, prepared: PreparedRequest) -> dict[str, Any]:
        return {
            "dry_run": True,
            "method": method,
            "url": prepared.url,
            "http_method": prepared.http_method,
            "content_type": prepared.content_type,
            "headers": dict(prepared.headers),
            "body": prepared.body,
        }


def encode_multipart(fields: dict[str, Any], files: dict[str, str], boundary: str) -> bytes:
    chunks: list[bytes] = []
    for key, value in fields.items():
        if value is None:
            continue
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{key}"\r\n'.encode(),
            b"Content-Type: text/plain; charset=utf-8\r\n\r\n",
            str(value).encode("utf-8"),
            b"\r\n",
        ])
    for key, filename in files.items():
        path = Path(filename)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{key}"; filename="{path.name}"\r\n'.encode(),
            f"Content-Type: {content_type}\r\n\r\n".encode(),
            path.read_bytes(),
            b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks)


def md5_file(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_to_temp(url: str) -> Path:
    suffix = Path(urllib.parse.urlparse(url).path).suffix or ".bin"
    target = Path("/tmp") / f"kuaishou-cli-{uuid.uuid4().hex}{suffix}"
    with urllib.request.urlopen(url, timeout=60) as response:
        target.write_bytes(response.read())
    return target


