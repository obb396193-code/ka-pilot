#!/usr/bin/env python3
"""
素材获取主流程：按组串行处理。

流程（每组独立执行）：
- 步骤1：通过 qihang-cli share material 批量共享素材到目标账户
- 步骤2：共享失败的素材走 upload 兜底

跨组复用：若同一 signature 出现在多个组，仅首次执行 API，后续组直接命中缓存（cached）。

输入：material_groups.json
输出：uploaded_materials.json（source 字段：qihang_shared / uploaded）
"""
import argparse
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cmd_with_retry
from upload_materials import upload_materials_batch

# ── qihang 批量共享（原 qihang_share_helper.py，合并于此） ──
QIHANG_BATCH_SIZE = 50
QIHANG_TIMEOUT = 60


def qihang_batch_share(signatures, target_id, batch_size=QIHANG_BATCH_SIZE, timeout=QIHANG_TIMEOUT):
    """
    通过 qihang-ks-cli share material 批量共享素材。

    Returns:
        tuple: (success_map: {sig -> photo_id}, failed_sigs: [sig...])
    """
    if not signatures:
        return {}, []

    if not shutil.which("qihang-ks-cli"):
        print("    [qihang] qihang-ks-cli 未安装，全部走上传", file=sys.stderr)
        return {}, list(signatures)

    all_success = {}
    all_failed = []

    for i in range(0, len(signatures), batch_size):
        chunk = signatures[i : i + batch_size]
        batch_idx = i // batch_size + 1
        total_batches = (len(signatures) + batch_size - 1) // batch_size

        if total_batches > 1:
            print(f"    [qihang] 批次 {batch_idx}/{total_batches}（{len(chunk)} 素材）")

        try:
            chunk_success, chunk_failed = _share_one_batch(chunk, target_id, timeout)
            all_success.update(chunk_success)
            all_failed.extend(chunk_failed)
        except RuntimeError as e:
            print(f"    [qihang] 批次 {batch_idx} 调用失败: {e}，全部回退上传", file=sys.stderr)
            all_failed.extend(chunk)

    return all_success, all_failed


def _share_one_batch(sigs_chunk, target_id, timeout):
    """执行单次 qihang-ks-cli share material 调用。"""
    cmd = [
        "qihang-ks-cli",
        "share", "material",
        "--account-id", str(target_id),
        "--signatures", *sigs_chunk,
        "--confirm",
        "--output", "json",
    ]
    result = run_cmd_with_retry(cmd, timeout=timeout, retry_on_timeout=False)
    return _parse_share_response(result.stdout, sigs_chunk)


def _parse_share_response(raw_output, all_sigs):
    """解析 qihang-ks-cli share material 的 JSON 输出。"""
    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON 解析失败: {e}, raw={raw_output[:200]}")

    data = parsed
    if isinstance(data, dict) and "data" in data and isinstance(data["data"], dict):
        data = data["data"]

    photo_id_map = data.get("photoIdMap") or data.get("photo_id_map") or {}
    failed_explicit = set(data.get("failedSignatures") or data.get("failed_signatures") or [])

    success_map = {}
    failed_sigs = []
    for sig in all_sigs:
        pid = photo_id_map.get(sig)
        if pid:
            success_map[sig] = str(pid)
        else:
            failed_sigs.append(sig)

    return success_map, failed_sigs


def _step1_qihang_share(materials, target_id):
    """步骤1：qihang 批量共享。返回 (uploads_dict, failed_sigs)。"""
    sigs = [m["signature"] for m in materials]
    total = len(sigs)
    print(f"  步骤1: qihang 批量共享（{total} 素材）")

    success_map, failed_sigs = qihang_batch_share(sigs, target_id)

    uploads = {}
    for mat in materials:
        sig = mat["signature"]
        if sig in success_map:
            name = mat.get("name") or mat.get("materialName") or ""
            uploads[sig] = {
                "photo_id": success_map[sig],
                "status": "success",
                "source": "qihang_shared",
                "name": name,
            }

    ok_n = len(uploads)
    fail_n = len(failed_sigs)
    print(f"    结果: 成功={ok_n}, 失败={fail_n}")
    for sig in list(success_map.keys())[:3]:
        print(f"    [OK] {sig[:16]}... → photo_id={success_map[sig]}")
    if fail_n > 0 and fail_n <= 5:
        for sig in failed_sigs:
            print(f"    [FAIL] {sig[:16]}... → 转上传")
    elif fail_n > 5:
        print(f"    [FAIL] ...{fail_n} 个素材转上传")

    return uploads, failed_sigs


def _process_group(group, idx, total_groups, target_id, processed):
    """处理单个素材组，返回该组 uploads 字典。"""
    item_id = group.get("item_id", "")
    title = (group.get("item_title") or group.get("title") or "")[:20]
    materials = group.get("materials", [])
    group_head = f"=== 组 {idx}/{total_groups} | item_id={item_id} | {title} | {len(materials)} 素材 ==="
    print(f"\n{group_head}", flush=True)

    if not materials:
        print("  (空组，跳过)")
        return {}, 0.0

    t0 = time.time()

    # 拆分：跨组已处理的 signature 直接命中缓存
    fresh = []
    cached_uploads = {}
    for mat in materials:
        sig = mat["signature"]
        if sig in processed:
            cached_uploads[sig] = processed[sig]
            print(
                f"  [cached] {sig[:16]}... → source={processed[sig].get('source')} "
                f"photo_id={processed[sig].get('photo_id')}"
            )
        else:
            fresh.append(mat)

    group_uploads = dict(cached_uploads)

    if fresh:
        # 步骤1: qihang 批量共享
        qihang_uploads, failed_sigs = _step1_qihang_share(fresh, target_id)
        group_uploads.update(qihang_uploads)

        # 步骤2: 失败的直接上传
        need_upload = [m for m in fresh if m["signature"] in set(failed_sigs)]
        print(f"  步骤2: 上传兜底（{len(need_upload)} 素材）")
        if need_upload:
            upload_results = upload_materials_batch(need_upload, target_id)
            group_uploads.update(upload_results)
        else:
            print("    无需上传。")
    else:
        print("  全部命中缓存，跳过 API 调用。")

    # 回写全局 processed
    for sig, r in group_uploads.items():
        if sig not in processed:
            processed[sig] = r

    # 组级 summary
    qihang_n = sum(1 for v in group_uploads.values() if v.get("source") == "qihang_shared")
    uploaded_n = sum(1 for v in group_uploads.values() if v.get("source") == "uploaded")
    failed_n = sum(1 for v in group_uploads.values() if v.get("status") != "success")
    cached_n = len(cached_uploads)
    elapsed = time.time() - t0
    print(
        f"  >> 组 summary: qihang_shared={qihang_n} uploaded={uploaded_n} "
        f"failed={failed_n} cached={cached_n} 耗时={elapsed:.1f}s",
        flush=True,
    )
    return group_uploads, elapsed


def run_acquire(input_path: str, output_path: str, advertiser_id: str) -> dict:
    """
    素材获取主流程（可被 import 调用，也可被 CLI main 调用）。

    Returns:
        dict: summary（total_groups / total / qihang_shared / uploaded / failed / elapsed_seconds）
    """
    target_id = str(advertiser_id)

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    groups = data.get("groups", [])
    if not groups:
        raise RuntimeError("无素材组需要处理")

    total_groups = len(groups)
    total_materials_uniq_seen = set()
    for g in groups:
        for m in g.get("materials", []):
            total_materials_uniq_seen.add(m["signature"])
    total_uniq = len(total_materials_uniq_seen)

    print(
        f"开始素材获取: {total_groups} 组, {total_uniq} 个去重 signature, 目标账户={target_id}",
        flush=True,
    )

    processed = {}
    all_uploads = {}
    t_start = time.time()

    for idx, group in enumerate(groups, 1):
        group_uploads, _ = _process_group(group, idx, total_groups, target_id, processed)
        for sig, r in group_uploads.items():
            all_uploads[sig] = r

    # 全局 summary
    qihang_n = sum(1 for v in all_uploads.values() if v.get("source") == "qihang_shared")
    uploaded_n = sum(1 for v in all_uploads.values() if v.get("source") == "uploaded")
    failed_n = sum(1 for v in all_uploads.values() if v.get("status") != "success")
    total_elapsed = time.time() - t_start

    summary = {
        "total_groups": total_groups,
        "total": len(all_uploads),
        "qihang_shared": qihang_n,
        "uploaded": uploaded_n,
        "failed": failed_n,
        "elapsed_seconds": round(total_elapsed, 2),
    }

    output = {"uploads": all_uploads, "summary": summary}

    out_dir = os.path.dirname(output_path) or "."
    os.makedirs(out_dir, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(
        f"\n=== 全局完成 ===\n组数: {total_groups} | 去重素材: {len(all_uploads)}\n"
        f"qihang共享: {qihang_n}, 上传: {uploaded_n}, 失败: {failed_n}\n"
        f"总耗时: {total_elapsed:.1f}s\n输出: {output_path}"
    )

    if failed_n > 0:
        failed_entries = [
            {"signature": sig, **info}
            for sig, info in all_uploads.items()
            if info.get("status") != "success"
        ]
        print(
            f"WARN: {failed_n} 个素材共享/上传失败，已忽略并继续（渲染阶段会自动跳过）:",
            file=sys.stderr,
        )
        for entry in failed_entries[:20]:
            print(
                f"  signature={entry.get('signature')} status={entry.get('status')} "
                f"error={entry.get('error', entry)}",
                file=sys.stderr,
            )
        if len(failed_entries) > 20:
            print(f"  ... 另有 {len(failed_entries) - 20} 条，详见 {output_path}", file=sys.stderr)

    return summary


def main():
    parser = argparse.ArgumentParser(description="素材获取（qihang 共享 + 上传兜底）")
    parser.add_argument("--input", required=True, help="material_groups.json 路径")
    parser.add_argument("--output", required=True, help="uploaded_materials.json 输出路径")
    parser.add_argument("--advertiser-id", required=True, help="目标广告主账户 ID")
    args = parser.parse_args()

    try:
        run_acquire(args.input, args.output, args.advertiser_id)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
