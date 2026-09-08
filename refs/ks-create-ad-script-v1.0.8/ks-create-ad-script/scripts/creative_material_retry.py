#!/usr/bin/env python3
"""三级创意创建失败时，按素材层错误剔除 photo_list 中的问题素材并重试。"""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from batch_create import _classify_error, _run_one

_PHOTO_ID_PATTERNS = (
    re.compile(r"视频ID=(\d+)"),
    re.compile(r"photo[_ ]?id[=:\s\"']*(\d+)", re.IGNORECASE),
)

# 可通过剔除单条素材尝试恢复的错误类型
_RECOVERABLE_KINDS = frozenset({
    "material_orientation",
    "material_size",
    "material_invalid",
})


def extract_failed_photo_id(error_text: str) -> int | None:
    """从快手报错文本中提取问题 video/photo_id。"""
    if not error_text:
        return None
    for pattern in _PHOTO_ID_PATTERNS:
        match = pattern.search(error_text)
        if match:
            return int(match.group(1))
    return None


def prune_photo_from_payload(payload_path: str, photo_id: int) -> tuple[bool, int]:
    """
    从 creative payload 的 photo_list 移除指定 photo_id。

    Returns:
        (removed, remaining_count)
    """
    with open(payload_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    photo_list = payload.get("photo_list") or []
    new_list = [
        item for item in photo_list
        if int(item.get("photo_id", 0)) != photo_id
    ]
    if len(new_list) == len(photo_list):
        return False, len(photo_list)
    payload["photo_list"] = new_list
    with open(payload_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return True, len(new_list)


def _rebuild_summary(results: list[dict]) -> dict:
    success_count = sum(1 for r in results if r.get("status") == "success")
    fail_count = len(results) - success_count
    failure_breakdown = {}
    for r in results:
        if r.get("status") == "success":
            continue
        kind = r.get("error_kind", "unknown")
        layer = r.get("fix_layer", "inspect")
        bucket = failure_breakdown.setdefault(kind, {"layer": layer, "count": 0, "idx": []})
        bucket["count"] += 1
        bucket["idx"].append(r.get("idx"))
    return {
        "total": len(results),
        "success": success_count,
        "failed": fail_count,
        "failure_breakdown": failure_breakdown,
    }


def retry_creatives_with_material_prune(
    advertiser_id: str,
    acct_dir: str,
    creative_results: dict,
    *,
    max_prune_per_creative: int = 20,
) -> tuple[dict, list[dict]]:
    """
    对 material 层失败的三级创意，剔除报错素材后重试。

    Returns:
        (updated_creative_results, prune_warnings)
    """
    results = list(creative_results.get("results") or [])
    warnings: list[dict] = []

    for slot, result in enumerate(results):
        if result.get("status") == "success":
            continue

        error_kind = result.get("error_kind")
        fix_layer = result.get("fix_layer")
        if fix_layer != "material" or error_kind not in _RECOVERABLE_KINDS:
            continue

        idx = result.get("idx")
        payload_path = os.path.join(acct_dir, f"creative_payload_{idx}.json")
        if not os.path.exists(payload_path):
            continue

        prune_attempts = 0
        while prune_attempts < max_prune_per_creative:
            error_text = result.get("error") or ""
            photo_id = extract_failed_photo_id(error_text)
            if photo_id is None:
                break

            removed, remaining = prune_photo_from_payload(payload_path, photo_id)
            if not removed:
                warnings.append({
                    "idx": idx,
                    "photo_id": photo_id,
                    "action": "not_in_payload",
                    "message": f"组{idx} 报错 photo_id={photo_id} 不在 photo_list，无法剔除",
                })
                break

            prune_attempts += 1
            warn = {
                "idx": idx,
                "photo_id": photo_id,
                "error_kind": error_kind,
                "remaining_photos": remaining,
                "action": "pruned_and_retry",
            }
            warnings.append(warn)
            print(
                f"  [WARN] 组{idx} 剔除素材 photo_id={photo_id} "
                f"({error_kind})，剩余 {remaining} 条，重试三级创建...",
                file=sys.stderr,
            )

            if remaining == 0:
                result = {
                    **result,
                    "status": "failed",
                    "error": f"组{idx} 剔除问题素材后 photo_list 为空",
                    "error_kind": "material_exhausted",
                    "fix_layer": "material",
                }
                results[slot] = result
                break

            retry = _run_one(
                advertiser_id,
                ["creative", "create-program"],
                payload_path,
                timeout=60,
                max_retries=0,
            )
            retry["idx"] = idx
            retry["file"] = os.path.basename(payload_path)
            if retry.get("status") == "success":
                retry["recovered_after_prune"] = True
                retry["pruned_photos"] = [
                    w["photo_id"] for w in warnings
                    if w.get("idx") == idx and w.get("action") == "pruned_and_retry"
                ]
                results[slot] = retry
                print(f"  [create] 组{idx} 剔除素材后创建成功（剩余 {remaining} 条）")
                break

            kind, layer = _classify_error(retry.get("error") or "")
            retry["error_kind"] = kind
            retry["fix_layer"] = layer
            result = retry
            results[slot] = result
            if layer != "material" or kind not in _RECOVERABLE_KINDS:
                break
            if extract_failed_photo_id(retry.get("error") or "") == photo_id:
                warnings.append({
                    "idx": idx,
                    "photo_id": photo_id,
                    "action": "same_photo_after_prune",
                    "message": "剔除后仍报同一 photo_id，停止重试",
                })
                break

    updated = {
        "results": results,
        "summary": _rebuild_summary(results),
    }
    if warnings:
        updated["material_prune_warnings"] = warnings
    return updated, warnings
