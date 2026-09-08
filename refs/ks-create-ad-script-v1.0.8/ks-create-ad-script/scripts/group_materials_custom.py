#!/usr/bin/env python3
"""
自定义素材策略：从用户提供的 JSON 列表按商品聚合、分配广告组。

仅接受 JSON 文件（Agent 负责将 Markdown/表格等先转为 JSON）。
由 create_ads.py → material_pipeline 内部调用，不作为 Agent 独立入口。

分配规则：
- total_capacity > ad_num → 轮询（每商品每轮至多 1 组）
- total_capacity <= ad_num → 按素材量比例分配（最大余数法），且不超过各商品 capacity

无商品 item_id 输出 "NULL"。
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import OrderedDict
from pathlib import Path

NO_ITEM_KEY = "__NO_ITEM__"
NO_ITEM_OUTPUT = "NULL"

_FIELD_KEYS = {
    "signature": "signature",
    "url": "url",
    "itemid": "item_id",
}


def _normalize_key(key: str) -> str:
    return key.replace("_", "").lower()


def _coerce_item_id(raw) -> str:
    if raw is None:
        return NO_ITEM_KEY
    if isinstance(raw, str):
        stripped = raw.strip()
        if not stripped or stripped.upper() == "NULL":
            return NO_ITEM_KEY
        return stripped
    return str(raw)


def _normalize_record(obj: dict) -> dict | None:
    if not isinstance(obj, dict):
        return None
    mapped: dict[str, object] = {}
    for key, value in obj.items():
        canon = _FIELD_KEYS.get(_normalize_key(str(key)))
        if canon:
            mapped[canon] = value
    signature = str(mapped.get("signature") or "").strip()
    url = str(mapped.get("url") or "").strip()
    if not signature or not url:
        return None
    item_key = _coerce_item_id(mapped.get("item_id"))
    return {
        "signature": signature,
        "url": url,
        "item_id": item_key,
        "name": "",
    }


def _extract_rows(raw) -> list:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("materials", "data", "items"):
            val = raw.get(key)
            if isinstance(val, list):
                return val
    raise ValueError("JSON 顶层须为数组，或含 materials/data/items 数组字段")


def load_custom_materials_json(path: str | Path) -> tuple[list[dict], list[dict]]:
    """读取 JSON 文件并归一化。返回 (materials, rejected)。"""
    p = Path(path).expanduser()
    if not p.is_file():
        raise FileNotFoundError(f"custom_materials_file 不存在: {p}")
    if p.suffix.lower() != ".json":
        raise ValueError(
            f"custom_materials_file 必须是 .json 文件: {p}；"
            "Markdown/表格等请 Agent 先转为 JSON"
        )
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"custom_materials_file 不是合法 JSON: {p}: {exc}") from exc

    rows = _extract_rows(raw)
    materials: list[dict] = []
    rejected: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for idx, row in enumerate(rows):
        norm = _normalize_record(row)
        if not norm:
            rejected.append({"index": idx, "reason": "missing signature or url", "row": row})
            continue
        dedupe_key = (norm["item_id"], norm["signature"])
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        materials.append(norm)

    return materials, rejected


def aggregate_by_item(materials: list[dict]) -> OrderedDict[str, list[dict]]:
    buckets: OrderedDict[str, list[dict]] = OrderedDict()
    for mat in materials:
        key = _coerce_item_id(mat.get("item_id"))
        normalized = {**mat, "item_id": key}
        buckets.setdefault(key, []).append(normalized)
    return buckets


def _item_output_id(item_key: str) -> str:
    return NO_ITEM_OUTPUT if item_key == NO_ITEM_KEY else item_key


def proportional_alloc(
    counts: dict[str, int],
    capacity: dict[str, int],
    target: int,
) -> dict[str, int]:
    eligible = [k for k in counts if capacity.get(k, 0) > 0]
    total = sum(counts[k] for k in eligible)
    if not eligible or target <= 0 or total <= 0:
        return {k: 0 for k in counts}

    floors: dict[str, int] = {}
    remainders: list[tuple[float, str]] = []
    for k in eligible:
        exact = target * counts[k] / total
        base = int(exact)
        base = min(base, capacity[k])
        floors[k] = base
        remainders.append((exact - int(exact), k))

    alloc = {k: 0 for k in counts}
    for k in eligible:
        alloc[k] = floors[k]

    assigned = sum(alloc.values())
    slack = target - assigned
    remainders.sort(key=lambda x: (-x[0], -counts[x[1]], x[1]))

    for _, k in remainders:
        if slack <= 0:
            break
        if alloc[k] < capacity[k]:
            alloc[k] += 1
            slack -= 1

    # 若仍有空位（cap 导致），按素材量从大到小继续补
    if slack > 0:
        for k in sorted(eligible, key=lambda x: (-counts[x], x)):
            while slack > 0 and alloc[k] < capacity[k]:
                alloc[k] += 1
                slack -= 1

    return alloc


def round_robin_alloc(capacity: dict[str, int], counts: dict[str, int], target: int) -> dict[str, int]:
    order = sorted(
        [k for k in capacity if capacity.get(k, 0) > 0],
        key=lambda k: (-counts[k], k),
    )
    alloc = {k: 0 for k in capacity}
    remaining = target
    while remaining > 0:
        progressed = False
        for k in order:
            if remaining <= 0:
                break
            if alloc[k] < capacity[k]:
                alloc[k] += 1
                remaining -= 1
                progressed = True
        if not progressed:
            break
    return alloc


def allocate_group_counts(
    buckets: OrderedDict[str, list[dict]],
    ad_num: int,
    group_size: int,
) -> tuple[dict[str, int], str, int]:
    counts = {k: len(v) for k, v in buckets.items()}
    capacity = {k: len(v) // group_size for k, v in buckets.items()}
    total_capacity = sum(capacity.values())
    target = min(ad_num, total_capacity)

    if total_capacity > ad_num:
        mode = "round_robin"
        alloc = round_robin_alloc(capacity, counts, target)
    else:
        mode = "proportional"
        alloc = proportional_alloc(counts, capacity, target)

    return alloc, mode, target


def build_groups(
    buckets: OrderedDict[str, list[dict]],
    alloc: dict[str, int],
    group_size: int,
) -> list[dict]:
    groups: list[dict] = []
    for item_key, num_groups in alloc.items():
        if num_groups <= 0:
            continue
        mats = buckets[item_key]
        offset = 0
        used_sigs: set[str] = set()
        out_item_id = _item_output_id(item_key)

        for _ in range(num_groups):
            selected: list[dict] = []
            while len(selected) < group_size and offset < len(mats):
                mat = mats[offset]
                offset += 1
                sig = mat["signature"]
                if sig in used_sigs:
                    continue
                used_sigs.add(sig)
                selected.append({
                    "signature": sig,
                    "name": mat.get("name") or "",
                    "url": mat["url"],
                    "item_id": out_item_id,
                })

            if len(selected) < group_size:
                print(
                    f"  [WARN] item={out_item_id} 组内仅有 {len(selected)}/{group_size} 条素材",
                    file=sys.stderr,
                )
            if not selected:
                continue

            title = selected[0].get("name") or out_item_id
            groups.append({
                "item_id": out_item_id,
                "item_title": title,
                "materials": selected,
            })

    return groups


def select_custom_groups(
    materials: list[dict],
    ad_num: int,
    group_size: int,
) -> tuple[list[dict], dict]:
    buckets = aggregate_by_item(materials)
    if not buckets:
        return [], {
            "mode": "proportional",
            "requested_ad_num": ad_num,
            "actual_groups": 0,
            "total_capacity": 0,
            "by_item": {},
        }

    counts = {k: len(v) for k, v in buckets.items()}
    capacity = {k: len(v) // group_size for k, v in buckets.items()}
    total_capacity = sum(capacity.values())
    alloc, mode, target = allocate_group_counts(buckets, ad_num, group_size)
    groups = build_groups(buckets, alloc, group_size)

    by_item = {_item_output_id(k): alloc.get(k, 0) for k in buckets if alloc.get(k, 0) > 0}
    meta = {
        "mode": mode,
        "requested_ad_num": ad_num,
        "actual_groups": len(groups),
        "total_capacity": total_capacity,
        "target_groups": target,
        "by_item": by_item,
        "item_counts": {_item_output_id(k): counts[k] for k in buckets},
    }
    return groups, meta


def preview_custom_material_stats(path: str | Path) -> dict:
    """供 preview_confirm 展示：归一化后素材数 / 商品数。"""
    materials, rejected = load_custom_materials_json(path)
    buckets = aggregate_by_item(materials)
    return {
        "file": str(Path(path).expanduser()),
        "total_materials": len(materials),
        "item_count": len(buckets),
        "rejected": len(rejected),
        "by_item": {_item_output_id(k): len(v) for k, v in buckets.items()},
    }


def run_custom_grouping(
    input_path: str | Path,
    ad_num: int,
    group_size: int,
    output_path: str | Path,
    normalized_path: str | Path | None = None,
) -> dict:
    materials, rejected = load_custom_materials_json(input_path)
    if not materials:
        raise RuntimeError("自定义素材归一化后为空，请检查 custom_materials_file")

    if normalized_path:
        norm_payload = {
            "materials": [
                {**m, "item_id": _item_output_id(m["item_id"])} for m in materials
            ],
            "rejected": rejected,
        }
        np = Path(normalized_path)
        np.parent.mkdir(parents=True, exist_ok=True)
        np.write_text(json.dumps(norm_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    groups, allocation = select_custom_groups(materials, ad_num, group_size)
    if not groups:
        raise RuntimeError("自定义素材分组结果为空（素材不足以组成任何广告组）")

    total_materials = sum(len(g["materials"]) for g in groups)
    result = {
        "groups": groups,
        "total_groups": len(groups),
        "total_materials": total_materials,
        "strategy": "自定义",
        "allocation": allocation,
    }

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="自定义素材策略圈选（create_ads 内部调用）")
    parser.add_argument("--input", required=True, help="custom_materials JSON 文件路径")
    parser.add_argument("--target-groups", type=int, required=True, help="目标广告组数 (= ad_num)")
    parser.add_argument("--group-size", type=int, required=True, help="每组素材数")
    parser.add_argument("--output", required=True, help="material_groups.json 输出路径")
    parser.add_argument("--normalized-output", default=None, help="归一化结果落盘路径（可选）")
    args = parser.parse_args()

    if args.target_groups < 1 or args.group_size < 1:
        print("[ERROR] --target-groups 与 --group-size 必须 >= 1", file=sys.stderr)
        return 2

    try:
        result = run_custom_grouping(
            args.input,
            args.target_groups,
            args.group_size,
            args.output,
            normalized_path=args.normalized_output,
        )
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    alloc = result["allocation"]
    print(f"\n=== 自定义素材圈选完成 ===")
    print(f"模式: {alloc['mode']} | 请求组数: {alloc['requested_ad_num']} | 实际组数: {result['total_groups']}")
    print(f"capacity: {alloc['total_capacity']} | 使用素材: {result['total_materials']}")
    for item_id, n in alloc.get("by_item", {}).items():
        print(f"  {item_id}: {n} 组")
    print(f"输出: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
