#!/usr/bin/env python3
"""
版位规格常量、素材尺寸校验与主版型一致性过滤。

scene_id → 版位名 → 可投素材规格（宽高范围），供素材库策略等共用。
版位 ID 仅表示「投放版位」，与素材横竖方向不是同一概念，调用方不要混用。
"""
import sys

SCENE_ID_TO_INVENTORY = {
    1:  "KUAI_SHOU_YOU_XUAN",
    10: "KUAI_SHOU_LIAN_MENG",
    6:  "KUAI_SHOU_SHANG_XIA_DA_PING",
    24: "ENCOURAGE_VIDEO",
    27: "OPEN_SCREEN",
}

SCENE_ID_LABEL = {
    1:  "优选",
    10: "联盟",
    6:  "上下滑大屏",
    24: "激励视频",
    27: "开屏",
}

INVENTORY_SPECS = {
    "KUAI_SHOU_YOU_XUAN": [
        {"type": "VIDEO", "min_w": 720, "max_w": 1440, "min_h": 1280, "max_h": 2560},
        {"type": "VIDEO", "min_w": 1280, "max_w": 2560, "min_h": 720, "max_h": 1440},
    ],
    "KUAI_SHOU_LIAN_MENG": [
        {"type": "VIDEO", "min_w": 720, "max_w": 1440, "min_h": 1280, "max_h": 2560},
        {"type": "VIDEO", "min_w": 1280, "max_w": 2560, "min_h": 720, "max_h": 1440},
        {"type": "IMAGE", "min_w": 1280, "max_w": 2560, "min_h": 720, "max_h": 1440},
        {"type": "IMAGE", "min_w": 720, "max_w": 1440, "min_h": 1280, "max_h": 2560},
    ],
    "KUAI_SHOU_SHANG_XIA_DA_PING": [
        {"type": "VIDEO", "min_w": 720, "max_w": 1440, "min_h": 1280, "max_h": 2560},
        {"type": "VIDEO", "min_w": 1280, "max_w": 2560, "min_h": 720, "max_h": 1440},
        {"type": "IMAGE", "min_w": 720, "max_w": 1440, "min_h": 1280, "max_h": 2560},
    ],
    "ENCOURAGE_VIDEO": [
        {"type": "VIDEO", "min_w": 1280, "max_w": 2560, "min_h": 720, "max_h": 1440},
        {"type": "VIDEO", "min_w": 720, "max_w": 1440, "min_h": 1280, "max_h": 2560},
    ],
    "OPEN_SCREEN": [
        {"type": "IMAGE", "min_w": 1080, "max_w": 1080, "min_h": 1920, "max_h": 1920},
        {"type": "VIDEO", "min_w": 720, "max_w": 1080, "min_h": 1280, "max_h": 1920},
    ],
}


def scene_ids_to_inventory_names(scene_ids):
    """将 scene_id 列表转为去重的版位名列表（取并集）。"""
    names = set()
    for sid in scene_ids:
        inv = SCENE_ID_TO_INVENTORY.get(int(sid))
        if inv:
            names.add(inv)
        else:
            print(f"[WARN] 未知 scene_id={sid}，跳过版位映射", file=sys.stderr)
    return sorted(names)


def parse_image_size(image_size_str):
    """解析 '720*1280' 格式为 (width, height)，失败返回 None。"""
    if not image_size_str or not isinstance(image_size_str, str):
        return None
    parts = image_size_str.split("*")
    if len(parts) != 2:
        return None
    try:
        return int(parts[0]), int(parts[1])
    except (ValueError, TypeError):
        return None


def matches_any_spec(width, height, inventory_names):
    """检查 width×height 是否满足任一版位的任一规格。"""
    for inv_name in inventory_names:
        specs = INVENTORY_SPECS.get(inv_name, [])
        for spec in specs:
            if (spec["min_w"] <= width <= spec["max_w"]
                    and spec["min_h"] <= height <= spec["max_h"]):
                return True
    return False


def filter_materials_by_spec(materials, inventory_names, sig_key="signature", size_key="imageSize"):
    """
    按版位规格过滤素材列表。

    返回 (passed, rejected) 两个列表。
    尺寸缺失的素材视为通过（宁可多投不漏投）。
    """
    if not inventory_names:
        return materials, []
    passed = []
    rejected = []
    for mat in materials:
        dims = parse_image_size(mat.get(size_key))
        if dims is None:
            passed.append(mat)
            continue
        w, h = dims
        if matches_any_spec(w, h, inventory_names):
            passed.append(mat)
        else:
            rejected.append(mat)
    return passed, rejected


def describe_scene_ids(scene_ids):
    """把 scene_id 列表渲染成 '1(优选), 10(联盟)' 这种可读串。"""
    parts = []
    for sid in scene_ids or []:
        try:
            n = int(sid)
        except (TypeError, ValueError):
            continue
        label = SCENE_ID_LABEL.get(n)
        parts.append(f"{n}({label})" if label else str(n))
    return ", ".join(parts)
