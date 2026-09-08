#!/usr/bin/env python3
"""
素材签名使用次数过滤。

并发查询每个素材 signature 的使用次数（qihang-cli signature usage），
过滤掉使用次数超过阈值的素材。

使用次数含义：有曝光的素材被多少个有曝光的创意使用。
"""
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cli_with_retry

USAGE_THRESHOLD = 10
MEDIA = "KUAISHOU"
MAX_WORKERS = 16

_usage_cache: dict[str, int] = {}
_cache_lock = threading.Lock()


def _query_one(signature: str, media: str = MEDIA) -> tuple[str, int, str | None]:
    with _cache_lock:
        if signature in _usage_cache:
            return signature, _usage_cache[signature], None
    try:
        resp = run_cli_with_retry(
            ["qihang-cli", "signature", "usage",
             "--media", media, "--signature", signature, "--output", "json"],
            timeout=30,
        )
        count = resp.get("usageCount", 0) if isinstance(resp, dict) else 0
        error = None
    except Exception as e:
        count = 0
        error = str(e)
    with _cache_lock:
        _usage_cache[signature] = count
    return signature, count, error


def filter_by_signature_usage(
    materials: list[dict],
    threshold: int = USAGE_THRESHOLD,
    media: str = MEDIA,
    sig_key: str = "signature",
) -> tuple[list[dict], dict]:
    """
    并发查询素材 signature 使用次数，过滤超过阈值的素材。

    Returns:
        (passed_materials, filter_summary)
        filter_summary: {"total", "passed", "filtered", "threshold", "filtered_signatures"}
    """
    if not materials:
        return materials, {"total": 0, "passed": 0, "filtered": 0, "threshold": threshold, "filtered_signatures": []}

    unique_sigs = list({m.get(sig_key, "") for m in materials if m.get(sig_key)})
    with _cache_lock:
        sigs_to_query = [s for s in unique_sigs if s not in _usage_cache]

    error_count = 0
    first_error = ""

    if sigs_to_query:
        print(f"  [signature-filter] 查询 {len(sigs_to_query)} 个 signature 使用次数...")
        workers = min(MAX_WORKERS, len(sigs_to_query))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(_query_one, sig, media)
                for sig in sigs_to_query
            ]
            for future in as_completed(futures):
                _, _, err = future.result()
                if err:
                    error_count += 1
                    if not first_error:
                        first_error = err

        if error_count > 0:
            print(
                f"  [signature-filter] WARNING: {error_count}/{len(sigs_to_query)} "
                f"个查询失败，失败素材视为通过。首条错误: {first_error[:300]}",
                file=sys.stderr,
            )

    with _cache_lock:
        sig_usage_snapshot = {s: _usage_cache.get(s, 0) for s in unique_sigs}
    for sig in unique_sigs:
        usage = sig_usage_snapshot[sig]
        mark = " ← 超阈值" if usage > threshold else ""
        print(f"    [usage] signature={sig} usageCount={usage}{mark}")

    passed = []
    filtered_details = []
    for mat in materials:
        sig = mat.get(sig_key, "")
        with _cache_lock:
            usage = _usage_cache.get(sig, 0)
        if usage > threshold:
            name = mat.get("name") or mat.get("materialName") or mat.get("material_name") or ""
            filtered_details.append((sig, usage, name))
        else:
            passed.append(mat)

    filtered_count = len(filtered_details)
    passed_count = len(passed)
    total = len(materials)
    print(
        f"  [signature-filter] 共 {total} 条素材，"
        f"通过 {passed_count} 条，过滤 {filtered_count} 条"
        f"（阈值: 使用次数 > {threshold}）"
    )
    if filtered_count > 0:
        for sig, usage, name in filtered_details:
            label = f" ({name})" if name else ""
            print(f"    [过滤] signature={sig} usageCount={usage}{label}")

    summary = {
        "total": total,
        "passed": passed_count,
        "filtered": filtered_count,
        "threshold": threshold,
        "filtered_signatures": [
            {"signature": sig, "usageCount": usage, "name": name}
            for sig, usage, name in filtered_details
        ],
    }
    return passed, summary


def merge_filter_summaries(summaries: list[dict]) -> dict:
    total = sum(s.get("total", 0) for s in summaries)
    passed = sum(s.get("passed", 0) for s in summaries)
    filtered = sum(s.get("filtered", 0) for s in summaries)
    threshold = summaries[0].get("threshold", USAGE_THRESHOLD) if summaries else USAGE_THRESHOLD
    seen = set()
    deduped = []
    for s in summaries:
        for item in s.get("filtered_signatures", []):
            sig = item.get("signature", "")
            if sig and sig not in seen:
                seen.add(sig)
                deduped.append(item)
    return {
        "total": total,
        "passed": passed,
        "filtered": filtered,
        "threshold": threshold,
        "filtered_signatures": deduped,
    }
