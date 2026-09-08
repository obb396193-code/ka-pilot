#!/usr/bin/env python3
"""
基建链接生成。

通过 qihang-cli link build 为每个商品组生成独立的跳转链接和监测链接。
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cmd_with_retry
from campaign_utils import should_attach_track_suffix

_NO_ITEM_LITERALS = frozenset({"", "NULL", "NONE", "NIL"})


def _normalize_item_id_for_link(raw) -> str:
    """无商品素材在 link build 侧须为空串（qihang-cli 会映射为 itemId=0）。"""
    if raw is None:
        return ""
    text = str(raw).strip()
    if text.upper() in _NO_ITEM_LITERALS:
        return ""
    return text


def _prepare_link_input(material_groups_path: str) -> str:
    """将 material_groups 转为 link build 可接受的 item_id（NULL → 空串）。"""
    with open(material_groups_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for group in data.get("groups", []):
        group["item_id"] = _normalize_item_id_for_link(group.get("item_id"))
        for mat in group.get("materials", []):
            mat["item_id"] = _normalize_item_id_for_link(mat.get("item_id"))
    fd, tmp_path = tempfile.mkstemp(suffix="_link_input.json", prefix="material_groups_")
    os.close(fd)
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return tmp_path


def resolve_link_key(item_id, group_index: int) -> str:
    """material_groups 的 item_id → links.json 中的 key。"""
    normalized = _normalize_item_id_for_link(item_id)
    if not normalized or normalized == "0":
        return f"no_item_{group_index}"
    return normalized


def build_links(acct: dict, context: dict, template: dict, acct_dir: str) -> str:
    """
    生成基建链接。

    Returns:
        str: links.json 的路径
    """
    advertiser_id = acct["advertiser_id"]
    task_id = context["task_id"]
    page_id = context["page_id"]
    track_suffix = context.get("track_suffix", "")

    # delivery_target 直接取模版 unit 的 ocpx_action_type
    delivery_target = template["unit"].get("ocpx_action_type")

    material_groups_path = os.path.join(acct_dir, "material_groups.json")
    output_path = os.path.join(acct_dir, "links.json")
    link_input_path = _prepare_link_input(material_groups_path)

    print(f"  [link] 生成基建链接 (delivery_target={delivery_target})...")

    cmd = [
        "qihang-cli", "link", "build",
        "--advertiser-id", str(advertiser_id),
        "--task-id", str(task_id),
        "--page-id", str(page_id),
        "--input", link_input_path,
        "--output-file", output_path,
        "--media", "KUAISHOU",
        "--delivery-target", str(delivery_target),
    ]

    # 投放目标为激活(ocpx_action_type=180) 且有 track_suffix 时附加
    ocpx_action_type = template["unit"].get("ocpx_action_type")
    if should_attach_track_suffix(ocpx_action_type, track_suffix):
        cmd.extend(["--track-suffix", track_suffix])

    try:
        run_cmd_with_retry(cmd, timeout=120, retry_on_timeout=False)
    except RuntimeError as e:
        raise RuntimeError(f"链接生成失败: {e}") from e
    finally:
        if os.path.exists(link_input_path):
            os.remove(link_input_path)

    if not os.path.exists(output_path):
        raise RuntimeError(f"链接输出缺失: {output_path}")

    # 验证链接完整性
    with open(output_path, "r", encoding="utf-8") as f:
        links_data = json.load(f)
    links = links_data.get("links", {})
    print(f"  [link] 生成完成: {len(links)} 组链接")

    return output_path
