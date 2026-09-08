#!/usr/bin/env python3
"""公共重试与限流工具模块"""
import time
import json
import subprocess
import sys
from functools import wraps

# 通用重试配置：失败重试最多 1 次，固定 5s 后执行。
MAX_RETRIES = 1
RETRY_DELAY = 5
CALL_INTERVAL = 2

# 限流关键词（timeout 已独立处理，不在此列表）
RATE_LIMIT_KEYWORDS = ["rate_limit", "too_many_requests", "frequency", "throttle"]

# token 失效/过期关键词（CLI 可能在重试时自动刷新 token）
TOKEN_EXPIRED_KEYWORDS = [
    "access token过期",
    "access_token",
    "token expired",
    "token失效",
    "token过期",
    "token invalid",
    "invalid token",
    "401001",
    "402000",
    "鉴权失败",
    "未授权",
]

def is_rate_limited(output_text):
    """检测输出是否包含限流信号"""
    lower = output_text.lower()
    return any(kw in lower for kw in RATE_LIMIT_KEYWORDS)

def is_token_expired(output_text):
    """检测输出是否包含 token 失效/过期信号"""
    if not output_text:
        return False
    lower = output_text.lower()
    return any(kw.lower() in lower for kw in TOKEN_EXPIRED_KEYWORDS)

def _failure_retry_reason(output_text):
    """返回失败重试原因标签；不可重试时返回 None。"""
    if is_rate_limited(output_text):
        return "限流检测"
    if is_token_expired(output_text):
        return "token失效/过期"
    return None

def should_retry_cli_failure(output_text, *, retry_all_failures=False):
    """判断 CLI 非零退出码是否值得重试一次。"""
    if _failure_retry_reason(output_text):
        return True
    return retry_all_failures

def run_cmd_with_retry(cmd, timeout=60, retry_on_timeout=True, retry_all_failures=False):
    """
    执行 CLI 命令，token/限流等可恢复错误自动重试一次。

    Returns:
        subprocess.CompletedProcess: returncode == 0 的结果

    Raises:
        RuntimeError: 超过最大重试次数仍失败
    """
    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout
            )
            if result.returncode == 0:
                return result

            error_output = result.stderr or result.stdout
            if attempt < MAX_RETRIES and should_retry_cli_failure(
                error_output, retry_all_failures=retry_all_failures
            ):
                tag = _failure_retry_reason(error_output) or "命令失败"
                print(
                    f"  [RETRY {attempt+1}/{MAX_RETRIES}] {tag}，等待 {RETRY_DELAY}s... "
                    f"退出码: {result.returncode} {error_output[:100]}",
                    file=sys.stderr,
                )
                time.sleep(RETRY_DELAY)
                continue
            last_error = f"命令失败 (退出码={result.returncode}): {error_output[:200]}"

        except subprocess.TimeoutExpired:
            if retry_on_timeout and attempt < MAX_RETRIES:
                print(
                    f"  [RETRY {attempt+1}/{MAX_RETRIES}] 超时({timeout}s)，等待 {RETRY_DELAY}s...",
                    file=sys.stderr,
                )
                time.sleep(RETRY_DELAY)
                continue
            raise RuntimeError(f"命令超时 ({timeout}s, retry_on_timeout={retry_on_timeout})")

        except Exception as e:
            last_error = str(e)
            if attempt < MAX_RETRIES:
                print(
                    f"  [RETRY {attempt+1}/{MAX_RETRIES}] 异常: {e}，等待 {RETRY_DELAY}s...",
                    file=sys.stderr,
                )
                time.sleep(RETRY_DELAY)
                continue

    raise RuntimeError(last_error)

def extract_cli_data(resp, *, expect="any"):
    """Normalize JSON from run_cli_with_retry.

    run_cli_with_retry unwraps list payloads but keeps dict envelopes;
    callers should use this helper instead of resp.get("data", resp).
    """
    if isinstance(resp, list):
        payload = resp
    elif isinstance(resp, dict):
        payload = resp.get("data", resp)
    else:
        payload = resp

    if expect == "list":
        return payload if isinstance(payload, list) else []
    if expect == "dict":
        return payload if isinstance(payload, dict) else {}
    return payload


def run_cli_with_retry(cmd, timeout=60, retry_on_timeout=True):
    """
    执行 CLI 命令，内置重试逻辑。

    Args:
        cmd: 命令列表 (list)
        timeout: 超时秒数
        retry_on_timeout: 超时是否重试。False 时超时直接抛错，避免阻塞批量任务。

    Returns:
        dict: 解析后的 JSON 结果

    Raises:
        RuntimeError: 超过最大重试次数仍失败
    """
    result = run_cmd_with_retry(
        cmd,
        timeout=timeout,
        retry_on_timeout=retry_on_timeout,
        retry_all_failures=True,
    )
    try:
        parsed = json.loads(result.stdout)
        if isinstance(parsed, dict) and "data" in parsed:
            return parsed["data"] if isinstance(parsed["data"], list) else parsed
        return parsed
    except json.JSONDecodeError:
        return {"raw_output": result.stdout.strip()}

def throttled_batch(items, process_fn, label="processing"):
    """
    批量执行带限流间隔的操作。
    
    Args:
        items: 待处理列表
        process_fn: 处理函数，接收 (item, index, total)
        label: 进度标签
    
    Returns:
        list: 每个 item 的结果（成功为结果dict，失败为 {"error": ...}）
    """
    results = []
    total = len(items)
    for i, item in enumerate(items):
        print(f"  [{i+1}/{total}] {label}...")
        try:
            result = process_fn(item, i, total)
            results.append(result)
        except Exception as e:
            print(f"  [{i+1}/{total}] FAILED: {e}", file=sys.stderr)
            results.append({"error": str(e)})
        
        # 批量间隔（最后一条不等待）
        if i < total - 1:
            time.sleep(CALL_INTERVAL)
    
    return results
