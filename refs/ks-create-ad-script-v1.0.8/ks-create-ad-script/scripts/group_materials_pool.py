#!/usr/bin/env python3
"""
素材库策略圈选工具。

从指定素材库中按商品维度圈选素材组，输出 material_groups.json。

规则：
- 需要 N 个素材组（N = target_groups），每组 group_size 个素材（默认 9）
- 若素材库商品数 >= N：按视频数量降序取前 N 个商品，每商品圈 group_size 个素材
- 若素材库商品数 < N：轮询商品分配组，组间素材不重复
- 可通过 --scene-ids 过滤不符合版位规格的素材（服务端过滤）

用法：
  python scripts/group_materials_pool.py \
    --pool-id 78584 \
    --target-groups 5 \
    --group-size 9 \
    --scene-ids 6,24 \
    --output tmp/material_groups.json
"""
import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inventory_filter import scene_ids_to_inventory_names  # noqa: E402
from retry_utils import extract_cli_data, run_cli_with_retry  # noqa: E402
from signature_filter import filter_by_signature_usage, merge_filter_summaries  # noqa: E402


def run_qihang_cli(args_list, timeout=60):
    """执行 qihang-cli 命令并返回解析后的 JSON。"""
    cmd = ["qihang-cli"] + args_list
    return run_cli_with_retry(cmd, timeout=timeout)


def _pool_cli_args(pool_ids: list[str]) -> list[str]:
    """qihang-cli material 多素材库并集：--pool-id id1 id2 ..."""
    return ["--pool-id", *[str(pid) for pid in pool_ids]]


def get_item_video_counts(pool_ids, inventory_names=None):
    """查询素材库各商品的视频数量，返回 [(item_id, count)] 降序排列。"""
    cmd = [
        "material", "count",
        "--media", "KUAISHOU",
        *_pool_cli_args(pool_ids),
    ]
    if inventory_names:
        cmd.extend(["--inventory-names"] + inventory_names)
    resp = run_qihang_cli(cmd)
    data = extract_cli_data(resp, expect="dict")
    items = []
    for item_id, type_map in data.items():
        if not isinstance(type_map, dict):
            continue
        # count API 返回 materialType 数值作为 key（"2" = VIDEO）
        video_count = type_map.get("2", 0)
        if video_count > 0:
            items.append((str(item_id), video_count))
    items.sort(key=lambda x: x[1], reverse=True)
    return items


def get_item_materials(pool_ids, item_id, page=1, page_size=500, inventory_names=None):
    """查询单个商品的素材明细列表。直接走 stdout，不再经 /tmp 文件中转。"""
    cli_item_id = "NULL" if not item_id else str(item_id)
    cmd = [
        "material", "list",
        "--media", "KUAISHOU",
        *_pool_cli_args(pool_ids),
        "--item-ids", cli_item_id,
        "--page", str(page),
        "--page-size", str(page_size),
    ]
    if inventory_names:
        cmd.extend(["--inventory-names"] + inventory_names)
    resp = run_qihang_cli(cmd)
    return extract_cli_data(resp, expect="list")


def select_groups(pool_ids, target_groups, group_size, inventory_names=None):
    """核心圈选逻辑。"""
    pool_ids = [str(p) for p in pool_ids]
    if inventory_names:
        print(f"[INFO] 版位过滤: {', '.join(inventory_names)}")
    pools_label = ",".join(pool_ids)
    print(f"[INFO] 查询素材库 {pools_label} 商品统计...")
    items = get_item_video_counts(pool_ids, inventory_names=inventory_names)
    if not items:
        print("[ERROR] 素材库无可用商品", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] 素材库商品数: {len(items)}, 目标组数: {target_groups}")
    for item_id, count in items:
        print(f"  {item_id}: {count} 个视频")

    # 计算每个商品实际需要拉取的素材上限，并截断到真正会用到的商品集合
    if len(items) >= target_groups:
        max_per_item = group_size
        items_to_fetch = items[:target_groups]  # 后面的商品根本不会用，不拉
    else:
        # 商品不够：每商品最多被分到 ceil(target_groups / len(items)) 组
        groups_per_item = (target_groups + len(items) - 1) // len(items)
        max_per_item = groups_per_item * group_size
        items_to_fetch = items

    print(
        f"\n[INFO] 加载商品素材明细（每商品上限 {max_per_item} 条，"
        f"并发拉取 {len(items_to_fetch)} 个商品）..."
    )

    def _fetch_one_item(item_id, video_count):
        need = min(video_count, max_per_item)
        pages_needed = (need + 499) // 500
        all_mats = []
        for page in range(1, pages_needed + 1):
            mats = get_item_materials(
                pool_ids, item_id, page=page,
                page_size=min(need, 500),
                inventory_names=inventory_names,
            )
            all_mats.extend(mats)
            if len(mats) < 500 or len(all_mats) >= need:
                break
        return item_id, all_mats[:max_per_item]

    with ThreadPoolExecutor(max_workers=min(8, len(items_to_fetch))) as ex:
        futures = [ex.submit(_fetch_one_item, iid, vc) for iid, vc in items_to_fetch]
        item_materials = dict(f.result() for f in futures)

    for item_id, _ in items_to_fetch:
        print(f"  {item_id}: 取回 {len(item_materials[item_id])} 条")

    print(f"\n[INFO] 签名使用次数过滤...")
    filter_summaries = []
    for item_id in list(item_materials.keys()):
        passed, summary = filter_by_signature_usage(item_materials[item_id])
        item_materials[item_id] = passed
        filter_summaries.append(summary)
    sig_filter_summary = merge_filter_summaries(filter_summaries)
    if sig_filter_summary["filtered"] > 0:
        print(f"[INFO] 签名过滤完成: 共过滤 {sig_filter_summary['filtered']} 条素材")

    groups = []

    if len(items) >= target_groups:
        # 商品足够：每商品一组
        print(f"\n[INFO] 策略: 商品数({len(items)}) >= N({target_groups})，每商品一组")
        for i in range(target_groups):
            item_id = items[i][0]
            mats = item_materials[item_id][:group_size]
            groups.append(_build_group(mats, item_id, group_size))
    else:
        # 商品不够：轮询分配
        print(f"\n[INFO] 策略: 商品数({len(items)}) < N({target_groups})，轮询商品、素材不重复")
        item_offsets = {item_id: 0 for item_id, _ in items}
        used_sigs = {item_id: set() for item_id, _ in items}

        for i in range(target_groups):
            item_idx = i % len(items)
            item_id = items[item_idx][0]
            all_mats = item_materials[item_id]
            offset = item_offsets[item_id]

            selected = []
            while len(selected) < group_size and offset < len(all_mats):
                mat = all_mats[offset]
                sig = mat.get("signature", "")
                if sig and sig not in used_sigs[item_id]:
                    selected.append(mat)
                    used_sigs[item_id].add(sig)
                offset += 1
            item_offsets[item_id] = offset

            groups.append(_build_group(selected, item_id, group_size))

    return groups, sig_filter_summary


def _build_group(raw_materials, item_id, group_size):
    """将原始素材记录转为统一输出格式。"""
    materials = []
    for mat in raw_materials:
        materials.append({
            "signature": mat.get("signature", ""),
            "name": mat.get("materialName") or mat.get("material_name") or "",
            "url": mat.get("url") or mat.get("material_url") or "",
            "item_id": item_id,
        })

    if len(materials) < group_size:
        print(
            f"  [WARN] item={item_id} 仅有 {len(materials)}/{group_size} 条素材",
            file=sys.stderr,
        )

    item_title = materials[0].get("name", item_id) if materials else item_id
    return {
        "item_id": item_id,
        "item_title": item_title,
        "materials": materials,
    }


def main():
    parser = argparse.ArgumentParser(description="素材库策略圈选工具")
    parser.add_argument(
        "--pool-id",
        nargs="+",
        required=True,
        dest="pool_ids",
        metavar="POOL_ID",
        help="素材库 ID（可多个，qihang-cli 并集查询）",
    )
    parser.add_argument("--target-groups", type=int, required=True, help="目标素材组数（= 广告数）")
    parser.add_argument("--group-size", type=int, default=9, help="每组素材数（默认 9）")
    parser.add_argument("--scene-ids", default=None, help="模板 scene_id（逗号分隔），用于按版位规格过滤素材")
    parser.add_argument("--output", default="tmp/material_groups.json", help="输出路径")
    args = parser.parse_args()

    if args.target_groups < 1:
        print("[ERROR] --target-groups 必须 >= 1", file=sys.stderr)
        sys.exit(2)
    if args.group_size < 1:
        print("[ERROR] --group-size 必须 >= 1", file=sys.stderr)
        sys.exit(2)

    inventory_names = None
    if args.scene_ids:
        scene_ids = [int(s.strip()) for s in args.scene_ids.split(",") if s.strip()]
        inventory_names = scene_ids_to_inventory_names(scene_ids)
        if not inventory_names:
            print("[WARN] scene_ids 未映射到任何版位，不做过滤", file=sys.stderr)

    pool_ids = [str(p) for p in args.pool_ids]
    groups, sig_filter_summary = select_groups(pool_ids, args.target_groups, args.group_size, inventory_names=inventory_names)

    total_materials = sum(len(g["materials"]) for g in groups)
    result = {
        "groups": groups,
        "total_groups": len(groups),
        "total_materials": total_materials,
        "pool_ids": pool_ids,
        "signature_filter": sig_filter_summary,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # 输出 summary
    all_sigs = set()
    for g in groups:
        for m in g["materials"]:
            all_sigs.add(m["signature"])

    print(f"\n=== 圈选完成 ===")
    print(f"组数: {len(groups)}, 总素材: {total_materials}, 去重signature: {len(all_sigs)}")
    for i, g in enumerate(groups, 1):
        print(f"  组{i}: item={g['item_id']} | {len(g['materials'])} 素材")
    print(f"输出: {args.output}")

    if len(all_sigs) < total_materials:
        print(f"[WARN] 存在重复素材! 去重={len(all_sigs)} < 总数={total_materials}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
