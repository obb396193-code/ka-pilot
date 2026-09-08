#!/usr/bin/env python3
"""
批量上传素材视频

输入：material_groups.json（来自 group_materials_pool.py 等输出）
输出：uploaded_materials.json（signature → photo_id 映射表）

本模块同时支持：
1. 作为 CLI 直接调用（保持向后兼容）
2. 作为模块被 acquire_materials.py 导入，复用 upload_materials_batch()
"""
import argparse
import json
import sys
import os
import concurrent.futures
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cli_with_retry

MAX_WORKERS = 5


def upload_single_material(advertiser_id, material_url, raw_signature=""):
    """上传单个视频素材（超时 20s，超时不重试）"""
    cmd = [
        "kuaishou-cli", "material", "video-upload",
        "--advertiser-id", str(advertiser_id),
        "--url", material_url,
        "--type", "1"
    ]
    if raw_signature:
        cmd += ["--raw-signature", raw_signature]
    return run_cli_with_retry(cmd, timeout=20, retry_on_timeout=False)


def _extract_photo_id(result):
    """从 CLI 结果中尽力抽取 photo_id。"""
    if not isinstance(result, dict):
        return ""
    pid = result.get("photo_id") or result.get("photoId")
    if not pid and isinstance(result.get("data"), dict):
        pid = result["data"].get("photo_id") or result["data"].get("photoId")
    return str(pid) if pid else ""


def upload_materials_batch(materials_list, advertiser_id):
    """
    批量上传素材（可被其它脚本复用）。

    Args:
        materials_list: 待上传素材列表，元素含 signature / url(or materialUrl) / name(or materialName)
        advertiser_id: 目标账户 ID

    Returns:
        dict: { signature: {photo_id, status, source="uploaded", name, error?} }
    """
    results_map = {}
    if not materials_list:
        return results_map

    total = len(materials_list)
    progress_lock = threading.Lock()
    progress_counter = {"done": 0}

    def upload_one(args_tuple):
        mat, adv_id, idx = args_tuple
        sig = mat.get("signature", f"unknown_{idx}")
        url = mat.get("url") or mat.get("materialUrl") or ""
        name = mat.get("name") or mat.get("materialName") or ""

        if not url:
            with progress_lock:
                progress_counter["done"] += 1
                print(
                    f"  [{progress_counter['done']}/{total}] 上传失败: {sig[:16]}... (无有效 URL)"
                )
            return sig, {
                "photo_id": "",
                "status": "failed",
                "source": "uploaded",
                "name": name,
                "error": "素材无有效 URL",
            }

        try:
            result = upload_single_material(adv_id, url, raw_signature=sig)
        except RuntimeError as e:
            with progress_lock:
                progress_counter["done"] += 1
                print(
                    f"  [{progress_counter['done']}/{total}] 上传失败: {sig[:16]}... ({e})"
                )
            return sig, {
                "photo_id": "",
                "status": "failed",
                "source": "uploaded",
                "name": name,
                "error": str(e),
            }

        pid = _extract_photo_id(result)
        with progress_lock:
            progress_counter["done"] += 1
            tag = "上传成功" if pid else "上传失败(未解析到photo_id)"
            print(f"  [{progress_counter['done']}/{total}] {tag}: {sig[:16]}...")
        if not pid:
            return sig, {
                "photo_id": "",
                "status": "failed",
                "source": "uploaded",
                "name": name,
                "error": "未解析到 photo_id",
            }
        return sig, {
            "photo_id": pid,
            "status": "success",
            "source": "uploaded",
            "name": name,
        }

    tasks = [(m, advertiser_id, i) for i, m in enumerate(materials_list)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for sig, r in executor.map(upload_one, tasks):
            results_map[sig] = r
    return results_map


def _dedup_materials(groups):
    """从分组结构中按 signature 去重收集素材。"""
    all_materials = []
    seen = set()
    for group in groups:
        for mat in group.get("materials", []):
            sig = mat.get("signature", "")
            if sig and sig not in seen:
                seen.add(sig)
                all_materials.append(mat)
    return all_materials


def main():
    parser = argparse.ArgumentParser(description="批量上传素材视频")
    parser.add_argument("--input", required=True, help="输入文件路径（material_groups.json）")
    parser.add_argument("--output", required=True, help="输出文件路径（uploaded_materials.json）")
    parser.add_argument("--advertiser-id", required=True, help="广告主账户 ID")
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)

    all_materials = _dedup_materials(data.get("groups", []))
    if not all_materials:
        print("ERROR: 无素材需要上传", file=sys.stderr)
        sys.exit(1)

    print(f"开始上传 {len(all_materials)} 个素材...")
    uploads = upload_materials_batch(all_materials, args.advertiser_id)

    success = sum(1 for v in uploads.values() if v.get("status") == "success")
    failed = sum(1 for v in uploads.values() if v.get("status") != "success")

    output = {
        "uploads": uploads,
        "summary": {
            "total": len(all_materials),
            "success": success,
            "failed": failed,
        },
    }

    out_dir = os.path.dirname(args.output) or "."
    os.makedirs(out_dir, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    if failed > 0:
        print(f"\n完成! 成功: {success}, 失败: {failed}（失败素材已忽略）, 输出: {args.output}")
    else:
        print(f"\n完成! 成功: {success}, 失败: {failed}, 输出: {args.output}")
    sys.exit(0)


if __name__ == "__main__":
    main()
