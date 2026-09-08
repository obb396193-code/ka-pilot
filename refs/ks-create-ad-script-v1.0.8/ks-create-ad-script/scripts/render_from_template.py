#!/usr/bin/env python3
"""
基于模版账户拉取的 123 级 JSON 渲染新广告 payload。

模式：
  full-render          清洗模版 + 渲染所有 payload（campaign_id/unit_id 占位 0）
  fill-campaign-id     回填 campaign_id 到 unit_payload_*.json
  fill-unit-ids        回填 unit_id 到 creative_payload_*.json
  extract-unit-ids     从 batch_create 结果文件提取 idx:unit_id 映射

用法：
  python scripts/render_from_template.py full-render \
    --template-campaign tmp/template_campaign.json \
    --template-unit tmp/template_unit.json \
    --template-creative tmp/template_creative.json \
    --account-id 108714412 --bid 30000 \
    --task-id 1803240580 --page-id landing_v2_1314 \
    --action-bar "立即购买" --expose-tags "爆款秒杀,热卖爆款" \
    --kol-user-id 1483210910 --text-pool-id 357
"""
from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import uuid
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inventory_filter import describe_scene_ids  # noqa: E402
from link_builder import resolve_link_key  # noqa: E402
from campaign_utils import CAMPAIGN_TYPE_LABEL, resolve_campaign_type  # noqa: E402
from campaign_utils import apply_disable_installed_app_switch, resolve_disable_installed_app_switch  # noqa: E402
from schedule_utils import parse_schedule_time, schedule_time_label  # noqa: E402

PLACEHOLDER_ID = 0
DEFAULT_TMP = "tmp"

CAMPAIGN_TYPE_NAME_SEGMENT = {
    35: "UAA_DELIVERY",
    2: "KUAI_SHOU_IMPROVE_APP_INSTALL-UAA_DELIVERY",
    7: "KUAI_SHOU_IMPROVE_ACTIVE-UAA_DELIVERY",
}

CAMPAIGN_KEEP_FIELDS = {
    "campaign_type", "bid_type", "day_budget", "ad_type", "dsp_version",
    "campaign_sub_type", "campaign_ocpx_action_type", "campaign_deep_conversion_type",
    "auto_build", "auto_manage", "auto_adjust", "periodic_delivery_type",
    "periodic_delivery_put_type", "continue_period_type", "periodic_days",
    "range_budget", "day_budget_schedule", "smart_material_supply", "auto_photo_scope",
}

UNIT_KEEP_FIELDS = {
    "bid_type", "ocpx_action_type", "scene_id", "unit_type", "unit_material_type",
    "site_type", "show_mode", "target", "dsp_version", "target_explore", "url_type",
    "link_integration_type", "use_app_market", "app_store", "enhance_conversion_type",
    "deep_conversion_type", "deep_conversion_bid", "outer_loop_native",
    "adv_card_option", "convert_id", "quick_search", "extend_search",
    "night_scheduled_tag", "app_id", "package_id", "playable_id",
    "playable_orientation", "template_id", "component_id", "consult_id",
    "live_component_type", "live_user_id", "jingle_bell_id", "series_id",
    "series_pay_mode", "series_pay_template_id", "series_card_type",
    "series_card_info", "compensate_status", "bid", "roi_ratio",
    "search_population_retargeting", "asset_mining", "web_uri_type",
}

CREATIVE_KEEP_FIELDS = {
    "creative_category", "creative_tag", "material_intelligent_optimize",
    "app_grade_type", "micro_change_switch", "open_account_native",
    "outer_loop_native", "sticker_styles", "cover_slogans", "kol_user_type",
}


def _rand6() -> str:
    return "".join(random.choices(string.digits, k=6))


def _uuid32() -> str:
    return uuid.uuid4().hex


def _load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _dump_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def _extract_template_label(campaign_name: str) -> str:
    """从模版 campaign_name 提取标签。
    例：'模板001-订单提交-优选-双端-含dp-115216' → '订单提交-优选-双端'
    """
    parts = campaign_name.split("-")
    if len(parts) >= 4:
        return "-".join(parts[1:4])
    elif len(parts) >= 2:
        return "-".join(parts[1:])
    return campaign_name


def _clean_campaign(raw: dict, account_id: int, task_id: str, campaign_rand6: str,
                    template_label: str, name_segment: str, name_prefix: str = "") -> dict:
    """清洗一级 payload。"""
    today = date.today()
    ymd = today.strftime("%Y%m%d")

    campaign = {}
    for k in CAMPAIGN_KEEP_FIELDS:
        if k in raw and raw[k] is not None:
            campaign[k] = raw[k]

    campaign_name = f"{name_prefix}{task_id}-{ymd}-{campaign_rand6}-{name_segment}-cli"
    # 快手限制计划名 1-100 字符
    if len(campaign_name) > 100:
        campaign_name = campaign_name[:100]
    campaign["advertiser_id"] = account_id
    campaign["campaign_name"] = campaign_name
    campaign["auto_build_name_rule"] = {
        "unit_name_rule": f"{campaign_rand6}_[日期][序号]",
        "creative_name_rule": f"creative_{campaign_rand6}_[日期][序号]",
    }

    # campaign_type is stored as "type" in create API but returned as "campaign_type" in get API
    if "campaign_type" in campaign:
        campaign["type"] = campaign.pop("campaign_type")

    return campaign, campaign_name


def _clean_unit(raw: dict) -> dict:
    """清洗二级，只保留允许字段。"""
    unit = {}
    for k in UNIT_KEEP_FIELDS:
        if k in raw and raw[k] is not None:
            unit[k] = raw[k]
    # OCPX 模式下值为0的出价字段无意义，移除以避免 CLI 校验报错
    for _bf in ("bid", "deep_conversion_bid"):
        if unit.get(_bf) == 0:
            del unit[_bf]
    # 小米应用商店直投已下线，创建时会报错
    stores = unit.get("app_store")
    if isinstance(stores, list):
        unit["app_store"] = [s for s in stores if s != "xiaomi"]
    return unit


def _clean_creative(raw: dict) -> dict:
    """清洗三级，只保留允许字段。"""
    creative = {}
    for k in CREATIVE_KEEP_FIELDS:
        if k in raw and raw[k] is not None:
            creative[k] = raw[k]
    return creative


def cmd_full_render(args: argparse.Namespace) -> int:
    tmp = Path(args.tmp_dir)
    tmp.mkdir(parents=True, exist_ok=True)

    # Load template data
    tpl_campaign_raw = _load_json(Path(args.template_campaign))
    tpl_unit_raw = _load_json(Path(args.template_unit))
    tpl_creative_raw = _load_json(Path(args.template_creative))

    # Extract details[0] from API response format
    if "data" in tpl_campaign_raw and "details" in tpl_campaign_raw["data"]:
        tpl_campaign = tpl_campaign_raw["data"]["details"][0]
    else:
        tpl_campaign = tpl_campaign_raw

    if "data" in tpl_unit_raw and "details" in tpl_unit_raw["data"]:
        tpl_unit = tpl_unit_raw["data"]["details"][0]
    else:
        tpl_unit = tpl_unit_raw

    if "data" in tpl_creative_raw and "details" in tpl_creative_raw["data"]:
        tpl_creative_list = tpl_creative_raw["data"]["details"]
        tpl_creative = tpl_creative_list[0] if tpl_creative_list else {}
    else:
        tpl_creative = tpl_creative_raw

    # Load intermediate files
    captions_file = tmp / "captions.json"
    groups_file = tmp / "material_groups.json"
    links_file = tmp / "links.json"
    uploads_file = tmp / "uploaded_materials.json"

    for p in (captions_file, groups_file, links_file, uploads_file):
        if not p.exists():
            print(f"[ERROR] 缺失输入: {p}", file=sys.stderr)
            return 2

    captions = _load_json(captions_file).get("captions", [])
    if len(captions) < 3:
        print(f"[ERROR] captions 少于 3 条 ({len(captions)})", file=sys.stderr)
        return 2
    groups = _load_json(groups_file).get("groups", [])
    links = _load_json(links_file).get("links", {})
    uploads = _load_json(uploads_file).get("uploads", {})
    if not groups:
        print("[ERROR] material_groups.json 无 groups", file=sys.stderr)
        return 2

    # Parse args
    account_id = int(args.account_id)
    bid = int(args.bid)
    task_id = str(args.task_id)
    page_id = str(args.page_id)
    kol_user_id = int(args.kol_user_id)

    # expose_tags: from args or inherit from template
    if args.expose_tags:
        expose_tags = [t.strip() for t in args.expose_tags.split(",") if t.strip()]
    else:
        raw_tags = tpl_creative.get("new_expose_tag") or []
        expose_tags = [t.get("text", "") for t in raw_tags if isinstance(t, dict)]
    if len(expose_tags) > 2:
        expose_tags = expose_tags[:2]
    while len(expose_tags) < 2:
        expose_tags.append("")

    # action_bar: from args or inherit from template
    action_bar = args.action_bar or tpl_creative.get("action_bar", "立即购买")

    disable_installed_app_switch, _ = resolve_disable_installed_app_switch(
        {"disable_installed_app_switch": args.disable_installed_app_switch}
        if args.disable_installed_app_switch is not None
        else None,
        tpl_unit,
    )

    # 投放时段：解析为 168 位 0/1 串，缺省不设置（按账户默认全天投放）
    schedule_time_bits = None
    if args.schedule_time:
        schedule_time_bits = parse_schedule_time(args.schedule_time)
        print(f"[schedule] 投放时段: {schedule_time_label(args.schedule_time)}")

    is_algorithm = getattr(args, "material_strategy", None) == "算法推荐"
    name_prefix = "sf-" if is_algorithm else ""
    campaign_name_prefix = args.campaign_name_prefix if args.campaign_name_prefix is not None else name_prefix

    today = date.today()
    mmdd = today.strftime("%m%d")
    begin_time = today.strftime("%Y-%m-%d")

    # Determine campaign type and name segment
    campaign_type = resolve_campaign_type(tpl_campaign)
    name_segment = CAMPAIGN_TYPE_NAME_SEGMENT.get(campaign_type, "UAA_DELIVERY")
    template_label = args.template_label or _extract_template_label(
        tpl_campaign.get("campaign_name", "unknown")
    )

    # === Render campaign ===
    campaign_rand6 = _rand6()
    if not args.no_campaign:
        campaign, campaign_name = _clean_campaign(
            tpl_campaign, account_id, task_id, campaign_rand6, template_label, name_segment,
            name_prefix=campaign_name_prefix,
        )
        _dump_json(campaign, tmp / "campaign_payload.json")
        print(f"[campaign] name={campaign_name}  type={campaign_type}")
    else:
        campaign_name = "(skipped)"
        print(f"[campaign] skipped (--no-campaign)")

    # === Render unit + creative per group ===
    base_unit = _clean_unit(tpl_unit)
    apply_disable_installed_app_switch(base_unit, disable_installed_app_switch)
    base_creative = _clean_creative(tpl_creative)

    unit_scene_ids = base_unit.get("scene_id") or []

    rendered = []
    skipped = []

    for i, g in enumerate(groups):
        idx = i + args.start_index
        item_id = g["item_id"]
        link_key = resolve_link_key(item_id, i)
        link = links.get(link_key) or {}
        if not link.get("url") or not link.get("exposureUrl") or not link.get("clickUrl"):
            print(f"[skip] 组{idx} item={item_id} 链接缺失", file=sys.stderr)
            skipped.append({"idx": idx, "item_id": item_id, "reason": "missing link"})
            continue

        # Build photo_list
        photo_list = []
        for mat in g.get("materials", []):
            sig = mat.get("signature", "")
            info = uploads.get(sig)
            if not info or info.get("status") != "success":
                continue
            photo_list.append({
                "photo_id": int(info["photo_id"]),
                "creative_material_type": 1,
            })
        if not photo_list:
            print(f"[skip] 组{idx} item={item_id} photo_list 为空", file=sys.stderr)
            skipped.append({"idx": idx, "item_id": item_id, "reason": "empty photo_list"})
            continue

        g_rand6 = _rand6()
        ad_group_name = f"{name_prefix}{g_rand6}-{mmdd}-{item_id}-{page_id}-cli"
        creative_name = f"{_uuid32()}-cli"

        # Unit payload
        unit = dict(base_unit)
        unit["advertiser_id"] = account_id
        unit["campaign_id"] = PLACEHOLDER_ID
        unit["unit_name"] = ad_group_name
        unit["cpa_bid"] = bid
        unit["url"] = link["url"]
        unit["begin_time"] = begin_time
        unit["put_status"] = 1

        # 投放时段（168 位 0/1 串）；未指定则不设置该字段，按账户默认全天投放
        if schedule_time_bits:
            unit["schedule_time"] = schedule_time_bits

        schema_val = link.get("schemaUri", "")
        if schema_val:
            unit["schema_uri"] = schema_val
        elif "schema_uri" in unit:
            del unit["schema_uri"]

        ulink_val = link.get("uLink", "")
        if ulink_val:
            unit["u_link"] = ulink_val
        elif "u_link" in unit:
            del unit["u_link"]

        # For 激活类(type=2), u_link should not be present
        if campaign_type == 2 and "u_link" in unit:
            del unit["u_link"]

        _dump_json(unit, tmp / f"unit_payload_{idx}.json")

        # Creative payload
        creative = dict(base_creative)
        creative["advertiser_id"] = account_id
        creative["unit_id"] = PLACEHOLDER_ID
        creative["package_name"] = creative_name
        creative["action_bar"] = action_bar
        creative["captions"] = list(captions[:3])
        creative["new_expose_tag"] = [
            {"text": expose_tags[0], "url": ""},
            {"text": expose_tags[1], "url": ""},
        ]
        creative["click_url"] = link.get("exposureUrl", "")
        creative["actionbar_click_url"] = link.get("clickUrl", "")
        creative["impression_url"] = ""
        creative["photo_list"] = photo_list
        if creative.get("outer_loop_native", 0) == 1:
            creative["kol_user_id"] = kol_user_id
        creative["ad_photo_played_t3s_url"] = ""

        _dump_json(creative, tmp / f"creative_payload_{idx}.json")

        rendered.append({
            "idx": idx,
            "item_id": item_id,
            "item_title": g.get("item_title", ""),
            "ad_group_name": ad_group_name,
            "creative_name": creative_name,
            "photo_count": len(photo_list),
        })

    ocpx_action_type = tpl_unit.get("ocpx_action_type")
    manifest = {
        "campaign_name": campaign_name,
        "campaign_type": campaign_type,
        "campaign_type_label": CAMPAIGN_TYPE_LABEL.get(campaign_type, str(campaign_type)),
        "advertiser_id": account_id,
        "task_id": task_id,
        "page_id": page_id,
        "bid": bid,
        "begin_time": begin_time,
        "action_bar": action_bar,
        "expose_tags": expose_tags,
        "captions": list(captions[:3]),
        "ocpx_action_type": ocpx_action_type,
        "delivery_target": ocpx_action_type,
        "disable_installed_app_switch": disable_installed_app_switch,
        "schedule_time": schedule_time_bits,
        "schedule_time_label": schedule_time_label(args.schedule_time) if args.schedule_time else "未指定（按账户默认全天投放）",
        "scene_id": list(unit_scene_ids),
        "scene_id_label": describe_scene_ids(unit_scene_ids),
        "template_source": {
            "account": str(args.template_account_id),
            "campaign_id": tpl_campaign.get("campaign_id"),
            "unit_id": tpl_unit.get("unit_id"),
        },
        "groups_rendered": rendered,
        "groups_skipped": skipped,
    }
    _dump_json(manifest, tmp / "render_manifest.json")

    print(f"\n[summary] rendered={len(rendered)} skipped={len(skipped)} → {tmp}/")
    for r in rendered:
        print(f"  组{r['idx']} item={r['item_id']} photos={r['photo_count']}")
        print(f"          unit_name={r['ad_group_name']}")
        print(f"          creative_name={r['creative_name']}")
    if skipped:
        for s in skipped:
            print(f"  [skip] 组{s['idx']} item={s['item_id']} reason={s['reason']}")
    return 0 if rendered else 3


def cmd_fill_campaign_id(args: argparse.Namespace) -> int:
    tmp = Path(args.tmp_dir)
    cid = int(args.campaign_id)
    files = sorted(tmp.glob("unit_payload_*.json"))
    if not files:
        print(f"[ERROR] 未找到 {tmp}/unit_payload_*.json", file=sys.stderr)
        return 2
    for p in files:
        d = _load_json(p)
        d["campaign_id"] = cid
        _dump_json(d, p)
        print(f"  {p.name} ← campaign_id={cid}")
    return 0


def cmd_fill_unit_ids(args: argparse.Namespace) -> int:
    tmp = Path(args.tmp_dir)
    mapping: dict[int, int] = {}
    for pair in args.unit_ids.split(","):
        pair = pair.strip()
        if not pair:
            continue
        try:
            k, v = pair.split(":", 1)
            mapping[int(k)] = int(v)
        except ValueError:
            print(f"[ERROR] --unit-ids 格式错误: {pair!r}", file=sys.stderr)
            return 2
    if not mapping:
        print("[ERROR] --unit-ids 未解析出任何映射", file=sys.stderr)
        return 2
    missing = []
    for idx, uid in sorted(mapping.items()):
        p = tmp / f"creative_payload_{idx}.json"
        if not p.exists():
            print(f"[ERROR] 缺失文件 {p}", file=sys.stderr)
            missing.append(idx)
            continue
        d = _load_json(p)
        d["unit_id"] = uid
        _dump_json(d, p)
        print(f"  {p.name} ← unit_id={uid}")
    return 2 if missing else 0


def cmd_extract_unit_ids(args: argparse.Namespace) -> int:
    results_data = _load_json(Path(args.results_file))
    results = results_data.get("results", [])
    pairs = []
    for r in results:
        if r.get("status") != "success":
            continue
        idx = r.get("idx")
        data = r.get("data", {})
        if isinstance(data, dict) and "data" in data:
            data = data["data"]
        unit_id = None
        if isinstance(data, dict):
            unit_id = data.get("unit_id")
        if idx is not None and unit_id is not None:
            pairs.append(f"{idx}:{unit_id}")
    if not pairs:
        print("[ERROR] 未提取到任何 unit_id 映射", file=sys.stderr)
        return 2
    print(",".join(pairs))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="基于模版账户渲染快手广告 payload")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_full = sub.add_parser("full-render", help="清洗模版 + 渲染所有 payload")
    p_full.add_argument("--template-campaign", required=True, help="模版一级 JSON 路径")
    p_full.add_argument("--template-unit", required=True, help="模版二级 JSON 路径")
    p_full.add_argument("--template-creative", required=True, help="模版三级 JSON 路径")
    p_full.add_argument("--account-id", required=True)
    p_full.add_argument("--bid", required=True, help="OCPX 出价（厘）")
    p_full.add_argument("--task-id", required=True)
    p_full.add_argument("--page-id", required=True)
    p_full.add_argument("--action-bar", default=None, help="行动号召按钮（缺省从模版继承）")
    p_full.add_argument("--expose-tags", default=None, help="推荐理由，逗号分隔最多2个（缺省从模版继承）")
    p_full.add_argument(
        "--disable-installed-app-switch",
        type=int,
        choices=[0, 1],
        default=None,
        help="过滤已安装：0=未开启，1=开启（缺省从模版 unit.target 继承）",
    )
    p_full.add_argument(
        "--schedule-time",
        default=None,
        help="投放时段，如 '周一到周五, 11点-23点' / '全天' / '工作日' / 168位0/1串（缺省不设置=全天）",
    )
    p_full.add_argument("--kol-user-id", required=True, type=int)
    p_full.add_argument("--template-label", default=None, help="模版标签（缺省从 campaign_name 推断）")
    p_full.add_argument("--template-account-id", default="78032070", help="模版账户 ID")
    p_full.add_argument("--text-pool-id", default="357")
    p_full.add_argument("--material-strategy", default=None, help="素材策略（算法推荐时名称加 sf 前缀）")
    p_full.add_argument("--campaign-name-prefix", default=None, help="覆盖一级计划名前缀（如 ab-）")
    p_full.add_argument("--start-index", type=int, default=1, help="组序号起始值（默认1）")
    p_full.add_argument("--no-campaign", action="store_true", help="跳过生成 campaign_payload.json")
    p_full.add_argument("--tmp-dir", default=DEFAULT_TMP)
    p_full.set_defaults(func=cmd_full_render)

    p_c = sub.add_parser("fill-campaign-id", help="回填 campaign_id")
    p_c.add_argument("--campaign-id", required=True)
    p_c.add_argument("--tmp-dir", default=DEFAULT_TMP)
    p_c.set_defaults(func=cmd_fill_campaign_id)

    p_u = sub.add_parser("fill-unit-ids", help="回填 unit_id")
    p_u.add_argument("--unit-ids", required=True, help="'idx:unit_id,...'")
    p_u.add_argument("--tmp-dir", default=DEFAULT_TMP)
    p_u.set_defaults(func=cmd_fill_unit_ids)

    p_e = sub.add_parser("extract-unit-ids", help="从结果文件提取 idx:unit_id")
    p_e.add_argument("--results-file", required=True)
    p_e.set_defaults(func=cmd_extract_unit_ids)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
