#!/usr/bin/env python3
"""
确认摘要预览：在 Step 3 执行前解析并展示各账户的实际运行参数。

拉取模版 + 账户上下文（task_id / page_id / kol_user_id / track_suffix 等），
将「从模版继承」「从任务信息自动获取」等占位替换为具体值。

用法:
  python scripts/preview_confirm.py --config "$OUTPUT_DIR/ad_config.json"
  python scripts/preview_confirm.py --config "$OUTPUT_DIR/ad_config.json" --json
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ensure_deps import ensure_cli_deps
from account_context import get_account_context
from config_loader import MATERIAL_STRATEGY_ALGORITHM, MATERIAL_STRATEGY_ALGORITHM_AB, MATERIAL_STRATEGY_CUSTOM, load_config, resolve_pool_ids
from create_ads import resolve_output_dir
from group_materials_custom import preview_custom_material_stats
from campaign_utils import (
    CAMPAIGN_TYPE_LABEL,
    delivery_target_label,
    disable_installed_app_switch_label,
    is_activation_delivery_target,
    resolve_campaign_type,
    resolve_disable_installed_app_switch,
    should_attach_track_suffix,
)
from schedule_utils import schedule_time_label
from template_fetcher import fetch_template


def _resolve_creative_fields(acct: dict, template: dict) -> tuple[str, list[str]]:
    """与 render_from_template full-render 一致：解析行动号召与曝光标签。"""
    creative = template.get("creative") or {}
    action_bar = acct.get("action_bar") or creative.get("action_bar", "立即购买")

    if acct.get("expose_tags"):
        expose_tags = [t.strip() for t in str(acct["expose_tags"]).split(",") if t.strip()]
    else:
        raw_tags = creative.get("new_expose_tag") or []
        expose_tags = [
            t.get("text", "")
            for t in raw_tags
            if isinstance(t, dict) and t.get("text")
        ]
    expose_tags = [t for t in expose_tags if t][:2]
    return action_bar, expose_tags


def _resolve_track_suffix_usage(template: dict, track_suffix: str) -> tuple[int, bool, str]:
    """判断监测链接是否附加 track_suffix（与 link_builder 一致）。"""
    unit = template.get("unit") or {}
    ocpx_action_type = unit.get("ocpx_action_type")
    use_suffix = should_attach_track_suffix(ocpx_action_type, track_suffix)
    return ocpx_action_type, use_suffix, track_suffix or ""


def build_account_preview(acct: dict, preview_root: str) -> dict:
    """拉取单账户预览数据。"""
    advertiser_id = str(acct["advertiser_id"])
    acct_dir = os.path.join(preview_root, advertiser_id)
    os.makedirs(acct_dir, exist_ok=True)

    template = fetch_template(
        acct["template_account_id"], acct["campaign_id"], acct["unit_id"], acct_dir
    )
    context = get_account_context(
        advertiser_id,
        acct.get("page_id"),
        acct_dir,
        kol_user_id_override=acct.get("kol_user_id"),
    )

    action_bar, expose_tags = _resolve_creative_fields(acct, template)
    page_id = acct.get("page_id") or context["page_id"]
    unit = template.get("unit") or {}
    campaign = template.get("campaign") or {}
    campaign_type = resolve_campaign_type(campaign)
    delivery_target = unit.get("ocpx_action_type")
    disable_switch, disable_switch_source = resolve_disable_installed_app_switch(acct, unit)
    _, use_track_suffix, track_suffix = _resolve_track_suffix_usage(
        template, context.get("track_suffix", "")
    )

    schedule_time_raw = acct.get("schedule_time")
    schedule_label = schedule_time_label(schedule_time_raw)
    schedule_source = "配置指定" if schedule_time_raw else "未指定（按账户默认全天投放）"

    preview: dict = {
        "advertiser_id": advertiser_id,
        "template_account_id": str(acct["template_account_id"]),
        "campaign_id": acct["campaign_id"],
        "unit_id": acct["unit_id"],
        "cpa_bid": acct["cpa_bid"],
        "ad_num": acct["ad_num"],
        "group_size": acct["group_size"],
        "material_strategy": acct["material_strategy"],
        "pool_ids": resolve_pool_ids(acct),
        "text_pool_id": acct.get("text_pool_id"),
        "task_id": context["task_id"],
        "kol_user_id": context["kol_user_id"],
        "page_id": page_id,
        "page_id_source": "配置指定" if acct.get("page_id") else "任务信息",
        "action_bar": action_bar,
        "action_bar_source": "配置指定" if acct.get("action_bar") else "模版继承",
        "expose_tags": expose_tags,
        "expose_tags_source": "配置指定" if acct.get("expose_tags") else "模版继承",
        "campaign_type": campaign_type,
        "campaign_type_label": CAMPAIGN_TYPE_LABEL.get(campaign_type, str(campaign_type)),
        "delivery_target": delivery_target,
        "delivery_target_label": delivery_target_label(delivery_target),
        "use_track_suffix": use_track_suffix,
        "track_suffix": track_suffix,
        "is_activation_delivery": is_activation_delivery_target(delivery_target),
        "disable_installed_app_switch": disable_switch,
        "disable_installed_app_switch_label": disable_installed_app_switch_label(disable_switch),
        "disable_installed_app_switch_source": disable_switch_source,
        "schedule_time": schedule_time_raw,
        "schedule_time_label": schedule_label,
        "schedule_time_source": schedule_source,
    }

    if acct.get("material_strategy") == MATERIAL_STRATEGY_CUSTOM:
        mat_file = acct.get("custom_materials_file")
        try:
            preview["custom_material_stats"] = preview_custom_material_stats(mat_file)
        except (FileNotFoundError, ValueError, OSError) as exc:
            preview["custom_material_stats"] = {"file": mat_file, "error": str(exc)}

    if acct.get("material_strategy") == MATERIAL_STRATEGY_ALGORITHM:
        scene_ids = unit.get("scene_id") or []
        preview["algorithm_csites"] = [str(s) for s in scene_ids]

    if acct.get("material_strategy") == MATERIAL_STRATEGY_ALGORITHM_AB:
        scene_ids = unit.get("scene_id") or []
        preview["algorithm_csites"] = [str(s) for s in scene_ids]
        pool_num = acct["ad_num"] // 2
        algo_num = acct["ad_num"] - pool_num
        preview["ab_pool_groups"] = pool_num
        preview["ab_algo_groups"] = algo_num

    return preview


def format_summary(previews: list[dict]) -> str:
    """生成面向用户的确认摘要文本。"""
    lines = ["=== 广告创建确认 ===", f"账户数: {len(previews)}", ""]

    for i, p in enumerate(previews, start=1):
        cpa_yuan = p["cpa_bid"] / 1000
        pool_ids = p.get("pool_ids") or []
        if p.get("material_strategy") == MATERIAL_STRATEGY_CUSTOM:
            stats = p.get("custom_material_stats") or {}
            if stats.get("error"):
                material_line = f"自定义 | 文件: {stats.get('file', '-')} | 错误: {stats['error']}"
            else:
                material_line = (
                    f"自定义 | 文件: {stats.get('file', '-')} | "
                    f"素材: {stats.get('total_materials', 0)} | "
                    f"商品: {stats.get('item_count', 0)}"
                )
        elif p.get("material_strategy") == MATERIAL_STRATEGY_ALGORITHM:
            csites = p.get("algorithm_csites") or []
            csites_label = ",".join(csites) if csites else "-"
            material_line = f"算法推荐 | page_id={p['page_id']} | csites={csites_label}"
        elif p.get("material_strategy") == MATERIAL_STRATEGY_ALGORITHM_AB:
            csites = p.get("algorithm_csites") or []
            csites_label = ",".join(csites) if csites else "-"
            pool_label = ",".join(str(x) for x in pool_ids) if pool_ids else "-"
            material_line = (
                f"算法推荐AB | pool_ids={pool_label} | page_id={p['page_id']} | csites={csites_label}"
                f" | 素材查询 {p.get('ab_pool_groups', '?')} 组 / 算法推荐 {p.get('ab_algo_groups', '?')} 组"
            )
        else:
            pool_label = ",".join(str(x) for x in pool_ids) if pool_ids else "-"
            material_line = f"{p['material_strategy']} | pool_ids: {pool_label}"
        expose = ", ".join(p["expose_tags"]) if p["expose_tags"] else "(无)"
        if p["use_track_suffix"]:
            track_line = f"是 (后缀={p['track_suffix']})"
        elif p.get("track_suffix") and not p.get("is_activation_delivery"):
            track_line = (
                f"否 (投放目标={p['delivery_target_label']}，非激活；"
                f"任务后缀={p['track_suffix']} 不会附加到链接)"
            )
        elif p.get("is_activation_delivery"):
            track_line = "否 (激活目标但任务未配置后缀)"
        else:
            track_line = f"否 (投放目标={p['delivery_target_label']}，非激活)"

        lines.extend([
            f"[账户 {i}] advertiser_id={p['advertiser_id']}",
            f"  模版账户: {p['template_account_id']}",
            f"  模版: campaign_id={p['campaign_id']}, unit_id={p['unit_id']}",
            f"  计划类型: {p['campaign_type_label']} (campaign_type={p['campaign_type']})",
            f"  投放目标: {p['delivery_target_label']} (ocpx_action_type={p['delivery_target']})",
            f"  task_id: {p['task_id']}",
            f"  kol_user_id: {p['kol_user_id']}",
            f"  出价: {p['cpa_bid']} 厘 ({cpa_yuan:g} 元)",
            f"  广告数: {p['ad_num']} | 每组素材: {p['group_size']}",
            f"  素材策略: {material_line}",
            f"  文案库: text_pool_id={p['text_pool_id']}",
            f"  行动号召: {p['action_bar']} ({p['action_bar_source']})",
            f"  曝光标签: {expose} ({p['expose_tags_source']})",
            f"  承接页: {p['page_id']} ({p['page_id_source']})",
            f"  过滤已安装: {p['disable_installed_app_switch_label']} "
            f"(disable_installed_app_switch={p['disable_installed_app_switch']}, {p['disable_installed_app_switch_source']})",
            f"  投放时段: {p['schedule_time_label']}",
            f"  监测链接后缀: {track_line}",
            "",
        ])

    lines.append("确认执行？(Y/N)")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="生成广告创建确认摘要（含实际解析参数）")
    parser.add_argument("--config", required=True, help="ad_config.json 路径")
    parser.add_argument(
        "--output-dir",
        default=None,
        help="预览产物目录（默认 $OUTPUT_DIR/_confirm_preview）",
    )
    parser.add_argument("--json", action="store_true", help="输出 JSON 而非文本摘要")
    args = parser.parse_args()

    config = load_config(args.config)
    ensure_cli_deps(["kuaishou-cli", "qihang-cli", "qihang-ks-cli"])
    output_dir = args.output_dir or os.path.join(resolve_output_dir(), "_confirm_preview")

    previews = []
    for acct in config["accounts"]:
        previews.append(build_account_preview(acct, output_dir))

    if args.json:
        print(json.dumps({"accounts": previews}, ensure_ascii=False, indent=2))
    else:
        print(format_summary(previews))
    return 0


if __name__ == "__main__":
    sys.exit(main())
