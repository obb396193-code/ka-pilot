#!/usr/bin/env python3
"""
算法推荐策略圈选工具。

从算法系统按 predict_score 排序获取素材，按商品维度分组，输出 material_groups.json。

两阶段流程：
1. 初选：media=KUAISHOU + delivery_page_id + csite 查询 top N 素材，提取商品列表
2. 精选：按商品 + csite + delivery_page_id 圈选每组 group_size 条素材

用法：
  python scripts/group_materials_algorithm.py \
    --delivery-page-id landing_v2_2230 \
    --csites 6,24 \
    --target-groups 5 \
    --group-size 15 \
    --output tmp/material_groups.json
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cli_with_retry
from signature_filter import filter_by_signature_usage, merge_filter_summaries

MEDIA = "KUAISHOU"


def _query_algorithm(delivery_page_id, csite, page_size=100, item_id=None):
    """调用 algorithm-cli material query，返回 (rows, totalNum)。"""
    cmd = [
        "algorithm-cli", "material", "query",
        "--media", MEDIA,
        "--delivery-page-id", delivery_page_id,
        "--csite", str(csite),
        "--page-size", str(page_size),
    ]
    if item_id:
        cmd.extend(["--item-id", str(item_id)])
    resp = run_cli_with_retry(cmd, timeout=180)
    data = resp.get("data", {}) if isinstance(resp, dict) else {}
    rows = data.get("rows", []) if isinstance(data, dict) else []
    total = data.get("totalNum", 0) if isinstance(data, dict) else 0
    return rows, total


def _dedup_by_signature(rows, exclude_sigs=None):
    """按 signature 去重（保留最高 predict_score），可排除已用 signature。"""
    exclude = exclude_sigs or set()
    best = {}
    for row in rows:
        sig = row.get("signature", "")
        if not sig or sig in exclude:
            continue
        score = float(row.get("predict_score", 0) or 0)
        if sig not in best or score > float(best[sig].get("predict_score", 0) or 0):
            best[sig] = row
    return sorted(
        best.values(),
        key=lambda r: float(r.get("predict_score", 0) or 0),
        reverse=True,
    )


def query_top_materials(delivery_page_id, csites, top_n):
    """Phase 1: 多 csite 查询合并，取 top N 素材。"""
    all_rows = []
    for csite in csites:
        rows, total = _query_algorithm(delivery_page_id, csite, page_size=top_n)
        print(f"[INFO] csite={csite}: 取回 {len(rows)} 条 (total={total})")
        all_rows.extend(rows)
    deduped = _dedup_by_signature(all_rows)
    return deduped[:top_n]


def extract_unique_items(materials):
    """提取不重复的非空 item_id（保持首次出现顺序）。"""
    seen = set()
    items = []
    for mat in materials:
        item_id = (mat.get("item_id") or "").strip()
        if not item_id or item_id in seen:
            continue
        seen.add(item_id)
        items.append(item_id)
    return items


def distribute_ads(item_ids, ad_num):
    """将 ad_num 个广告分配到商品：items >= N 各 1 条；items < N 轮询。"""
    if len(item_ids) >= ad_num:
        return item_ids[:ad_num]
    return [item_ids[i % len(item_ids)] for i in range(ad_num)]


def fetch_group_materials(delivery_page_id, csites, item_id, group_size, exclude_sigs=None):
    """Phase 2: 为单条广告获取 group_size 条素材（支持排除已用 signature）。"""
    exclude = exclude_sigs or set()
    fetch_size = min(group_size + len(exclude), 500)
    all_rows = []
    for csite in csites:
        rows, _ = _query_algorithm(
            delivery_page_id, csite,
            page_size=fetch_size,
            item_id=item_id,
        )
        all_rows.extend(rows)
    deduped = _dedup_by_signature(all_rows, exclude_sigs=exclude)
    return deduped[:group_size]


def _build_group(raw_materials, item_id, item_title, group_size):
    """将算法返回的素材转为标准输出格式。"""
    materials = []
    for mat in raw_materials:
        materials.append({
            "signature": mat.get("signature", ""),
            "name": mat.get("material_name") or "",
            "url": mat.get("material_url") or "",
            "item_id": item_id or "NULL",
        })
    if len(materials) < group_size:
        print(
            f"  [WARN] item={item_id or 'NULL'} 仅有 {len(materials)}/{group_size} 条素材",
            file=sys.stderr,
        )
    return {
        "item_id": item_id or "NULL",
        "item_title": item_title or (item_id or "NULL"),
        "materials": materials,
    }


def select_groups(delivery_page_id, csites, target_groups, group_size):
    """核心圈选：Phase 1 初选 + Phase 2 精选。"""
    print(f"[INFO] Phase 1: 初选 top {target_groups} 素材 "
          f"(delivery_page_id={delivery_page_id}, csites={','.join(csites)})")
    top_materials = query_top_materials(delivery_page_id, csites, target_groups)
    if not top_materials:
        print("[ERROR] 算法系统无可用素材", file=sys.stderr)
        sys.exit(1)
    print(f"[INFO] Phase 1 结果: {len(top_materials)} 条素材")

    top_materials, phase1_summary = filter_by_signature_usage(top_materials)
    if phase1_summary["filtered"] > 0:
        print(f"[INFO] Phase 1 签名过滤后剩余: {len(top_materials)} 条素材")
    if not top_materials:
        print("[ERROR] 签名过滤后无可用素材", file=sys.stderr)
        sys.exit(1)

    item_ids = extract_unique_items(top_materials)
    print(f"[INFO] 提取到 {len(item_ids)} 个不同商品: {item_ids[:10]}")

    if not item_ids:
        print("[INFO] 所有素材无商品 ID，按无商品分组")
        item_ids = [""]

    # 构建 item_id → item_title 映射
    item_titles = {}
    for mat in top_materials:
        iid = (mat.get("item_id") or "").strip()
        if iid and iid not in item_titles:
            item_titles[iid] = mat.get("item_title") or ""

    ad_items = distribute_ads(item_ids, target_groups)
    unique_items_used = len(set(ad_items))
    print(f"[INFO] 分配 {target_groups} 个广告到 {unique_items_used} 个商品")

    print(f"\n[INFO] Phase 2: 为每个广告获取 {group_size} 条素材...")
    groups = []
    item_used_sigs = {}
    filter_summaries = [phase1_summary]

    for i, item_id in enumerate(ad_items):
        label = item_id or "NULL"
        print(f"  [{i + 1}/{target_groups}] item_id={label}...")
        used = item_used_sigs.setdefault(item_id, set())
        raw_mats = fetch_group_materials(
            delivery_page_id, csites,
            item_id or None, group_size,
            exclude_sigs=used,
        )
        raw_mats, phase2_summary = filter_by_signature_usage(raw_mats)
        filter_summaries.append(phase2_summary)
        for mat in raw_mats:
            sig = mat.get("signature", "")
            if sig:
                used.add(sig)
        groups.append(_build_group(
            raw_mats, item_id,
            item_titles.get(item_id, ""),
            group_size,
        ))
        print(f"    取回 {len(raw_mats)} 条素材")

    sig_filter_summary = merge_filter_summaries(filter_summaries)
    return groups, sig_filter_summary


def main():
    parser = argparse.ArgumentParser(description="算法推荐策略圈选工具")
    parser.add_argument("--delivery-page-id", required=True, help="承接页 ID (landing_v2_xxx)")
    parser.add_argument("--csites", required=True, help="csite 列表（逗号分隔），如 6,24")
    parser.add_argument("--target-groups", type=int, required=True, help="目标素材组数（= 广告数）")
    parser.add_argument("--group-size", type=int, default=15, help="每组素材数（默认 15）")
    parser.add_argument("--output", default="tmp/material_groups.json", help="输出路径")
    args = parser.parse_args()

    if args.target_groups < 1:
        print("[ERROR] --target-groups 必须 >= 1", file=sys.stderr)
        sys.exit(2)
    if args.group_size < 1:
        print("[ERROR] --group-size 必须 >= 1", file=sys.stderr)
        sys.exit(2)

    csites = [s.strip() for s in args.csites.split(",") if s.strip()]
    if not csites:
        print("[ERROR] --csites 不能为空", file=sys.stderr)
        sys.exit(2)

    groups, sig_filter_summary = select_groups(args.delivery_page_id, csites, args.target_groups, args.group_size)

    total_materials = sum(len(g["materials"]) for g in groups)
    result = {
        "groups": groups,
        "total_groups": len(groups),
        "total_materials": total_materials,
        "strategy": "算法推荐",
        "delivery_page_id": args.delivery_page_id,
        "csites": csites,
        "signature_filter": sig_filter_summary,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    all_sigs = set()
    for g in groups:
        for m in g["materials"]:
            all_sigs.add(m["signature"])

    print(f"\n=== 算法推荐圈选完成 ===")
    print(f"组数: {len(groups)}, 总素材: {total_materials}, 去重signature: {len(all_sigs)}")
    for i, g in enumerate(groups, 1):
        print(f"  组{i}: item={g['item_id']} | {len(g['materials'])} 素材")
    print(f"输出: {args.output}")


if __name__ == "__main__":
    main()
