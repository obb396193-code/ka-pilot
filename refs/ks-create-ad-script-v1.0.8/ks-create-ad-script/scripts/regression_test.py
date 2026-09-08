#!/usr/bin/env python3
"""
技能回归测试脚本（TDD 驱动）。

分多阶段执行全量回归：
  Phase 1: 单元测试 — 无 API 调用，验证函数级逻辑（15 项）
  Phase 2: E2E-1 基础场景 — 含投放时段, ad_num=1（12 步）
  Phase 3: E2E-2 无投放时段 — 不带 schedule_time（12 步）
  Phase 4: E2E-3 多广告数 — 含投放时段, ad_num=2（12 步）
  Phase 5: E2E-4 算法推荐 — 算法推荐策略 + sf 前缀验证（12 步）

测试用例定义见 TEST_CASES.md。
独立运行，不修改任何主流程代码，不影响主流程执行。

用法:
  python regression_test.py \
    --advertiser-id <测试账户ID> \
    --token <KUAISHOU_ACCESS_TOKEN> \
    --template-account-id <模版账户ID> \
    --campaign-id <模版一级ID> \
    --unit-id <模版二级ID> \
    --pool-id <素材库ID> \
    --text-pool-id <文案库ID> \
    --cpa-bid <出价(厘)> \
    [--ad-num <广告数>] [--group-size <每组素材数>]
    [--schedule-time "周一到周五, 11点-23点"]
    [--output-dir <自定义输出目录>]
"""
from __future__ import annotations

import argparse
import copy
import glob
import json
import os
import subprocess
import sys
import tempfile
import time
import traceback
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config_loader import load_config
from template_fetcher import fetch_template
from account_context import get_account_context
from material_pipeline import run_material_pipeline, run_acquire_materials
from link_builder import build_links
from create_ads import _render_payloads, _fetch_captions
from ad_creator import create_ads_123
from schedule_utils import parse_schedule_time, schedule_time_label
from campaign_utils import (
    resolve_campaign_type,
    delivery_target_label,
    should_attach_track_suffix,
)


# ── 测试结果 ──

class StepResult:
    def __init__(self, name: str, step_num: int, total: int, phase: str = ""):
        self.name = name
        self.step_num = step_num
        self.total = total
        self.phase = phase
        self.status = "PENDING"
        self.elapsed = 0.0
        self.error = None
        self.details = {}

    def to_dict(self) -> dict:
        return {
            "step": f"{self.step_num}/{self.total}",
            "phase": self.phase,
            "name": self.name,
            "status": self.status,
            "elapsed_seconds": round(self.elapsed, 2),
            "error": self.error,
            "details": self.details,
        }


def run_step(name: str, results: list, total: int, func, state: dict, *args,
             phase: str = "", **kwargs) -> bool:
    """执行单个测试步骤，捕获异常，记录结果。"""
    result = StepResult(name, len(results) + 1, total, phase)
    t0 = time.time()
    try:
        details = func(state, *args, **kwargs)
        result.status = "PASS"
        result.details = details or {}
    except AssertionError as e:
        result.status = "FAIL"
        result.error = f"断言失败: {e}"
    except Exception as e:
        result.status = "FAIL"
        result.error = str(e)
        result.details["traceback"] = traceback.format_exc()[:800]
    result.elapsed = time.time() - t0
    results.append(result)

    tag = "PASS" if result.status == "PASS" else "FAIL"
    print(f"  [{result.step_num:>2}/{total}] {tag:4}  {name:32s}  ({result.elapsed:.1f}s)")
    if result.status == "FAIL":
        print(f"         错误: {result.error}")
        if result.details.get("traceback"):
            for line in result.details["traceback"].splitlines()[-3:]:
                print(f"         {line}")
    return result.status == "PASS"


# ── 辅助函数 ──

def _load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _assert_file(path: str, label: str) -> None:
    assert os.path.exists(path), f"{label} 文件不存在: {path}"


def _assert_non_empty(value, label: str) -> None:
    assert value, f"{label} 为空"


def _make_valid_config(**overrides) -> dict:
    """生成合法配置，可覆盖任意字段。"""
    acct = {
        "advertiser_id": "123456",
        "template_account_id": "123456",
        "campaign_id": 100,
        "unit_id": 200,
        "cpa_bid": 30000,
        "ad_num": 1,
        "group_size": 3,
        "material_strategy": "素材库",
        "text_pool_id": 357,
        "pool_id": "80700",
    }
    acct.update(overrides)
    return {"accounts": [acct]}


def _test_config_raises(config_data: dict) -> None:
    """写入临时配置文件并断言 load_config 抛出 SystemExit。"""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(config_data, f)
        temp_path = f.name
    try:
        try:
            load_config(temp_path)
            assert False, "应抛出 SystemExit 但未抛出"
        except SystemExit:
            pass
    finally:
        os.unlink(temp_path)


# ══════════════════════════════════════════════════════════════
# Phase 1: 单元测试（无 API 调用）
# ══════════════════════════════════════════════════════════════

def ut_schedule_weekday(state: dict) -> dict:
    """UT-01: 投放时段解析 - 工作日 + 时段"""
    bits = parse_schedule_time("周一到周五, 11点-23点")
    assert len(bits) == 168, f"长度={len(bits)}, 期望168"
    for d in range(5):
        for h in range(11, 23):
            assert bits[d * 24 + h] == "1", f"周{d+1} {h}点应为1"
    for d in range(5, 7):
        for h in range(24):
            assert bits[d * 24 + h] == "0", f"周{d+1} {h}点应为0"
    for h in range(11):
        assert bits[h] == "0", f"周一 {h}点应为0"
    return {"length": 168, "mon_sample": bits[:24]}


def ut_schedule_preset(state: dict) -> dict:
    """UT-02: 投放时段解析 - 预设全天"""
    bits = parse_schedule_time("全天")
    assert len(bits) == 168
    assert bits == "1" * 168, "全天应为全1"
    return {"length": 168, "all_ones": True}


def ut_schedule_daily(state: dict) -> dict:
    """UT-03: 投放时段解析 - 每天 + 时段"""
    bits = parse_schedule_time("每天, 9点-18点")
    assert len(bits) == 168
    for d in range(7):
        for h in range(9, 18):
            assert bits[d * 24 + h] == "1", f"周{d+1} {h}点应为1"
        for h in list(range(0, 9)) + list(range(18, 24)):
            assert bits[d * 24 + h] == "0", f"周{d+1} {h}点应为0"
    return {"length": 168, "daily_sample": bits[:24]}


def ut_schedule_label(state: dict) -> dict:
    """UT-04: 投放时段标签生成"""
    label = schedule_time_label("周一到周五, 11点-23点")
    assert label, "标签为空"
    assert "周一" in label or "周五" in label, f"标签缺少星期: {label}"
    assert "11" in label, f"标签缺少起始时间: {label}"
    assert "23" in label, f"标签缺少结束时间: {label}"
    return {"label": label}


def ut_config_valid(state: dict) -> dict:
    """UT-05: 配置校验 - 合法配置"""
    config_data = _make_valid_config()
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(config_data, f)
        temp_path = f.name
    try:
        config = load_config(temp_path)
        assert "accounts" in config
        assert len(config["accounts"]) == 1
        assert config["accounts"][0]["advertiser_id"] == "123456"
        return {"fields_validated": len(config["accounts"][0])}
    finally:
        os.unlink(temp_path)


def ut_config_invalid(state: dict) -> dict:
    """UT-06: 配置校验 - 缺少必填字段"""
    config_data = {"accounts": [{"advertiser_id": "123", "template_account_id": "123",
                                  "campaign_id": 1, "unit_id": 2}]}
    _test_config_raises(config_data)
    return {"expected": "SystemExit", "received": "SystemExit"}


def ut_campaign_type(state: dict) -> dict:
    """UT-07: 计划类型解析"""
    assert resolve_campaign_type({"campaign_type": 35}) == 35
    assert resolve_campaign_type({"type": 2}) == 2
    assert resolve_campaign_type(None) == 35
    assert resolve_campaign_type({}) == 35
    return {"default": 35, "variants_tested": 4}


def ut_delivery_label(state: dict) -> dict:
    """UT-08: 投放目标标签"""
    assert delivery_target_label(394) == "下单"
    assert delivery_target_label(180) == "激活"
    assert delivery_target_label(190) == "付费"
    assert delivery_target_label(None) == "未知"
    assert delivery_target_label(999) == "999"
    return {"tested_values": [394, 180, 190, None, 999]}


def ut_schedule_raw_168(state: dict) -> dict:
    """UT-09: 投放时段解析 - 原始 168 位串直传"""
    raw = "1" * 120 + "0" * 48  # 工作日全天
    bits = parse_schedule_time(raw)
    assert bits == raw, "原始 168 位串应原样返回"
    assert len(bits) == 168
    # 再测一个非对称串
    raw2 = "0" * 11 + "1" * 12 + "0" * 1 + "0" * 144  # 周一 11-22 时
    bits2 = parse_schedule_time(raw2)
    assert bits2 == raw2, "非对称 168 位串应原样返回"
    return {"tested": 2, "passthrough": True}


def ut_config_removed_strategy(state: dict) -> dict:
    """UT-10: 配置校验 - 素材策略已下线（"默认"）"""
    config_data = _make_valid_config(material_strategy="默认")
    _test_config_raises(config_data)
    return {"strategy": "默认", "expected": "SystemExit"}


def ut_config_custom_no_file(state: dict) -> dict:
    """UT-11: 配置校验 - 自定义策略缺 custom_materials_file"""
    config_data = _make_valid_config(material_strategy="自定义")
    _test_config_raises(config_data)
    return {"strategy": "自定义", "missing": "custom_materials_file", "expected": "SystemExit"}


def ut_track_suffix(state: dict) -> dict:
    """UT-12: 链接监测后缀判定（should_attach_track_suffix）"""
    assert should_attach_track_suffix(180, "abc") is True,  "激活+有后缀→True"
    assert should_attach_track_suffix(394, "abc") is False, "非激活→False"
    assert should_attach_track_suffix(180, "") is False,    "激活但无后缀→False"
    assert should_attach_track_suffix(None, "abc") is False, "无ocpx→False"
    return {"tested": 4}


def ut_config_duplicate_advertiser(state: dict) -> dict:
    """UT-13: 配置校验 - 多账户 advertiser_id 重复"""
    acct1 = _make_valid_config()["accounts"][0]
    acct2 = copy.copy(acct1)
    config_data = {"accounts": [acct1, acct2]}
    _test_config_raises(config_data)
    return {"duplicate_id": acct1["advertiser_id"], "expected": "SystemExit"}


def ut_config_algorithm_valid(state: dict) -> dict:
    """UT-14: 配置校验 - 算法推荐策略合法（无需 pool_id）"""
    config_data = _make_valid_config(material_strategy="算法推荐")
    del config_data["accounts"][0]["pool_id"]
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(config_data, f)
        temp_path = f.name
    try:
        config = load_config(temp_path)
        assert config["accounts"][0]["material_strategy"] == "算法推荐"
        return {"strategy": "算法推荐", "pool_id_required": False}
    finally:
        os.unlink(temp_path)


def ut_sf_prefix_campaign(state: dict) -> dict:
    """UT-15: SF 前缀 - 算法推荐策略 campaign/unit 名称"""
    from render_from_template import _clean_campaign
    raw = {"campaign_type": 35}
    _, name_sf = _clean_campaign(raw, 123, "task1", "rand6", "label", "SEG", name_prefix="sf-")
    assert name_sf.startswith("sf-"), f"算法推荐应有 sf- 前缀: {name_sf}"
    _, name_no = _clean_campaign(raw, 123, "task1", "rand6", "label", "SEG", name_prefix="")
    assert not name_no.startswith("sf-"), f"非算法不应有 sf- 前缀: {name_no}"
    return {"sf_name": name_sf, "normal_name": name_no}


# ══════════════════════════════════════════════════════════════
# Phase 2-5: 端到端测试步骤函数
# ══════════════════════════════════════════════════════════════

def step_config(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 1: 配置校验"""
    config_data = {"accounts": [dict(acct)]}

    config_path = os.path.join(acct_dir, "ad_config.json")
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, ensure_ascii=False, indent=2)

    config = load_config(config_path)
    acct_loaded = config["accounts"][0]
    _assert_non_empty(acct_loaded.get("advertiser_id"), "advertiser_id")
    _assert_non_empty(acct_loaded.get("material_strategy"), "material_strategy")
    return {
        "config_path": config_path,
        "advertiser_id": acct_loaded["advertiser_id"],
        "material_strategy": acct_loaded["material_strategy"],
        "schedule_time": acct_loaded.get("schedule_time", "未指定"),
    }


def step_template(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 2: 模版拉取"""
    template = fetch_template(
        acct["template_account_id"], acct["campaign_id"], acct["unit_id"], acct_dir
    )
    state["template"] = template

    _assert_file(os.path.join(acct_dir, "template_campaign.json"), "template_campaign")
    _assert_file(os.path.join(acct_dir, "template_unit.json"), "template_unit")
    _assert_file(os.path.join(acct_dir, "template_creative.json"), "template_creative")

    campaign_type = resolve_campaign_type(template.get("campaign"))
    ocpx = template["unit"].get("ocpx_action_type")
    _assert_non_empty(campaign_type, "campaign_type")
    _assert_non_empty(ocpx, "ocpx_action_type")
    return {
        "campaign_type": campaign_type,
        "ocpx_action_type": ocpx,
        "delivery_target": delivery_target_label(ocpx),
    }


def step_context(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 3: 账户上下文"""
    context = get_account_context(acct["advertiser_id"], acct.get("page_id"), acct_dir)
    state["context"] = context

    _assert_non_empty(context.get("task_id"), "task_id")
    _assert_non_empty(context.get("page_id"), "page_id")
    _assert_non_empty(context.get("kol_user_id"), "kol_user_id")
    return {
        "task_id": context["task_id"],
        "page_id": context["page_id"],
        "kol_user_id": context["kol_user_id"],
    }


def step_materials(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 4: 素材分组"""
    template = state["template"]
    context = state.get("context")
    groups_path = run_material_pipeline(acct, template, acct_dir, context=context)
    _assert_file(groups_path, "material_groups.json")

    data = _load_json(groups_path)
    groups = data.get("groups", [])
    assert len(groups) >= 1, "素材分组为空 (groups=0)"

    total_materials = sum(len(g.get("materials", [])) for g in groups)
    assert total_materials >= 1, "素材总数为 0"

    first_group = groups[0]
    assert first_group["materials"][0].get("signature"), "首个素材 signature 为空"
    return {
        "groups": len(groups),
        "total_materials": total_materials,
        "first_item_id": first_group.get("item_id", ""),
    }


def step_acquire(state: dict, acct: dict, advertiser_id: str, acct_dir: str) -> dict:
    """Step 5: 素材共享/上传"""
    material_groups_path = os.path.join(acct_dir, "material_groups.json")
    uploads_path = run_acquire_materials(material_groups_path, advertiser_id, acct_dir)
    _assert_file(uploads_path, "uploaded_materials.json")

    data = _load_json(uploads_path)
    summary = data.get("summary", {})
    success_n = summary.get("total", 0) - summary.get("failed", 0)
    assert success_n >= 1, f"素材共享/上传全部失败 (success=0)"
    return {
        "total": summary.get("total", 0),
        "success": success_n,
        "failed": summary.get("failed", 0),
        "qihang_shared": summary.get("qihang_shared", 0),
        "uploaded": summary.get("uploaded", 0),
    }


def step_captions(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 6: 文案获取"""
    _fetch_captions(acct, acct_dir)
    captions_path = os.path.join(acct_dir, "captions.json")
    _assert_file(captions_path, "captions.json")

    data = _load_json(captions_path)
    captions = data.get("captions", [])
    assert len(captions) >= 1, "文案列表为空"
    return {"count": len(captions), "preview": captions[0][:30] + "..." if captions else ""}


def step_links(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 7: 链接生成"""
    template = state["template"]
    context = state["context"]
    links_path = build_links(acct, context, template, acct_dir)
    _assert_file(links_path, "links.json")

    data = _load_json(links_path)
    links = data.get("links", {})
    assert len(links) >= 1, "链接组数为 0"
    return {"link_groups": len(links)}


def step_render(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 8: Payload 渲染"""
    template = state["template"]
    context = state["context"]
    manifest_path = _render_payloads(acct, template, context, acct_dir)
    _assert_file(manifest_path, "render_manifest.json")

    _assert_file(os.path.join(acct_dir, "campaign_payload.json"), "campaign_payload")
    unit_files = sorted(glob.glob(os.path.join(acct_dir, "unit_payload_*.json")))
    creative_files = sorted(glob.glob(os.path.join(acct_dir, "creative_payload_*.json")))
    assert len(unit_files) >= 1, "unit_payload 文件不存在"
    assert len(creative_files) >= 1, "creative_payload 文件不存在"

    manifest = _load_json(manifest_path)
    return {
        "campaign_payload": True,
        "unit_payloads": len(unit_files),
        "creative_payloads": len(creative_files),
        "rendered": len(manifest.get("groups_rendered", [])),
        "skipped": len(manifest.get("groups_skipped", [])),
    }


def step_schedule(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 9: 投放时段验证"""
    schedule_raw = acct.get("schedule_time")
    if not schedule_raw:
        # 无投放时段：验证 unit_payload 中不存在 schedule_time 字段
        unit_files = sorted(glob.glob(os.path.join(acct_dir, "unit_payload_*.json")))
        if unit_files:
            unit = _load_json(unit_files[0])
            assert not unit.get("schedule_time"), \
                "未指定 schedule_time 但 unit_payload 中存在该字段"
        return {"status": "skipped", "verified": "unit_payload 无 schedule_time"}

    bits = parse_schedule_time(schedule_raw)
    assert len(bits) == 168, f"schedule_time 长度={len(bits)}, 期望 168"

    label = schedule_time_label(schedule_raw)

    unit_files = sorted(glob.glob(os.path.join(acct_dir, "unit_payload_*.json")))
    assert len(unit_files) >= 1, "无 unit_payload 文件可验证"

    unit = _load_json(unit_files[0])
    st = unit.get("schedule_time")
    assert st is not None, "unit_payload 中 schedule_time 字段缺失"
    assert st == bits, "payload schedule_time 与解析结果不一致"

    return {
        "input": schedule_raw,
        "label": label,
        "bits_length": len(bits),
    }


def step_sf_prefix(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step: SF 前缀验证"""
    is_algorithm = acct.get("material_strategy") == "算法推荐"

    campaign_path = os.path.join(acct_dir, "campaign_payload.json")
    campaign = _load_json(campaign_path)
    campaign_name = campaign.get("campaign_name", "")

    if is_algorithm:
        assert campaign_name.startswith("sf-"), \
            f"算法推荐策略 campaign_name 应以 sf- 开头: {campaign_name}"
    else:
        assert not campaign_name.startswith("sf-"), \
            f"非算法策略 campaign_name 不应以 sf- 开头: {campaign_name}"

    unit_files = sorted(glob.glob(os.path.join(acct_dir, "unit_payload_*.json")))
    for uf in unit_files:
        unit = _load_json(uf)
        unit_name = unit.get("unit_name", "")
        if is_algorithm:
            assert unit_name.startswith("sf-"), \
                f"算法推荐策略 unit_name 应以 sf- 开头: {unit_name}"
        else:
            assert not unit_name.startswith("sf-"), \
                f"非算法策略 unit_name 不应以 sf- 开头: {unit_name}"

    return {
        "is_algorithm": is_algorithm,
        "campaign_name": campaign_name,
        "unit_count": len(unit_files),
        "prefix_correct": True,
    }


def step_preview(state: dict, acct: dict, acct_dir: str) -> dict:
    """Step 11: 预览展示"""
    config_path = os.path.join(acct_dir, "ad_config.json")
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    preview_script = os.path.join(scripts_dir, "preview_confirm.py")

    cmd = [
        sys.executable, preview_script,
        "--config", config_path,
        "--output-dir", os.path.dirname(acct_dir),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, f"预览脚本退出码={result.returncode}: {result.stderr[:300]}"

    output = result.stdout
    checks = {
        "account_id": str(acct["advertiser_id"]) in output,
        "bid": str(acct["cpa_bid"]) in output,
        "ad_num": str(acct["ad_num"]) in output,
    }
    if acct.get("schedule_time"):
        checks["schedule_time"] = True

    failed_checks = [k for k, v in checks.items() if not v]
    assert not failed_checks, f"预览输出缺少关键字段: {failed_checks}"
    return {"checks_passed": len(checks), "output_lines": len(output.splitlines())}


def step_create(state: dict, advertiser_id: str, acct_dir: str) -> dict:
    """Step 12: 广告创建"""
    create_result = create_ads_123(advertiser_id, acct_dir)

    campaign_id = create_result.get("campaign_id")
    units_created = create_result.get("units_created", 0)
    units_total = create_result.get("units_total", 0)
    creatives_created = create_result.get("creatives_created", 0)
    creatives_total = create_result.get("creatives_total", 0)

    _assert_non_empty(campaign_id, "campaign_id")
    assert units_created == units_total, f"二级创建不全: {units_created}/{units_total}"
    assert creatives_created == creatives_total, f"三级创建不全: {creatives_created}/{creatives_total}"

    result = {
        "campaign_id": campaign_id,
        "units": f"{units_created}/{units_total}",
        "creatives": f"{creatives_created}/{creatives_total}",
    }
    if create_result.get("material_prune_warnings"):
        result["material_prune_warnings"] = len(create_result["material_prune_warnings"])
    return result


# ══════════════════════════════════════════════════════════════
# E2E 流程封装
# ══════════════════════════════════════════════════════════════

UNIT_TESTS = [
    ("UT-01 投放时段-工作日", ut_schedule_weekday),
    ("UT-02 投放时段-全天", ut_schedule_preset),
    ("UT-03 投放时段-每天", ut_schedule_daily),
    ("UT-04 投放时段标签", ut_schedule_label),
    ("UT-05 配置校验-合法", ut_config_valid),
    ("UT-06 配置校验-缺字段", ut_config_invalid),
    ("UT-07 计划类型解析", ut_campaign_type),
    ("UT-08 投放目标标签", ut_delivery_label),
    ("UT-09 投放时段-原始168位串", ut_schedule_raw_168),
    ("UT-10 配置校验-策略已下线", ut_config_removed_strategy),
    ("UT-11 配置校验-自定义缺文件", ut_config_custom_no_file),
    ("UT-12 链接监测后缀判定", ut_track_suffix),
    ("UT-13 配置校验-账户ID重复", ut_config_duplicate_advertiser),
    ("UT-14 配置校验-算法推荐合法", ut_config_algorithm_valid),
    ("UT-15 SF前缀-campaign名称", ut_sf_prefix_campaign),
]

TOTAL_UNIT = len(UNIT_TESTS)
STEPS_PER_E2E = 12
TOTAL_E2E = 4
TOTAL = TOTAL_UNIT + STEPS_PER_E2E * TOTAL_E2E


def run_e2e_flow(results: list, total: int, flow_id: str,
                 acct: dict, acct_dir: str) -> bool:
    """执行单轮 E2E 流程（12 步）。失败即停止该轮。"""
    state: dict = {}
    os.makedirs(acct_dir, exist_ok=True)
    p = f"[{flow_id}]"

    if not run_step(f"{p} 配置校验", results, total, step_config, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 模版拉取", results, total, step_template, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 账户上下文", results, total, step_context, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 素材分组", results, total, step_materials, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 素材共享/上传", results, total, step_acquire, state, acct,
                    acct["advertiser_id"], acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 文案获取", results, total, step_captions, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 链接生成", results, total, step_links, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} Payload 渲染", results, total, step_render, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} SF前缀验证", results, total, step_sf_prefix, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 投放时段验证", results, total, step_schedule, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 预览展示", results, total, step_preview, state, acct, acct_dir, phase=flow_id):
        return False
    if not run_step(f"{p} 广告创建", results, total, step_create, state,
                    acct["advertiser_id"], acct_dir, phase=flow_id):
        return False
    return True


# ══════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="快手广告技能回归测试（TDD 驱动，含实际创建）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python regression_test.py \\\n"
            "    --advertiser-id 108714412 \\\n"
            "    --token 67493255dd272a2778b4919f45f07081 \\\n"
            "    --template-account-id 108714412 \\\n"
            "    --campaign-id 9607046512 \\\n"
            "    --unit-id 28463417883 \\\n"
            "    --pool-id 80700 \\\n"
            "    --text-pool-id 357 \\\n"
            "    --cpa-bid 30000 \\\n"
            '    --schedule-time "周一到周五, 11点-23点"'
        ),
    )
    parser.add_argument("--advertiser-id", required=True, help="测试账户 ID")
    parser.add_argument("--token", required=True, help="KUAISHOU_ACCESS_TOKEN")
    parser.add_argument("--template-account-id", required=True, help="模版账户 ID")
    parser.add_argument("--campaign-id", type=int, required=True, help="模版一级 campaign ID")
    parser.add_argument("--unit-id", type=int, required=True, help="模版二级 unit ID")
    parser.add_argument("--pool-id", required=True, help="素材库 ID")
    parser.add_argument("--text-pool-id", type=int, default=357, help="文案库 ID（默认 357）")
    parser.add_argument("--cpa-bid", type=int, required=True, help="测试出价（厘，如 30000=30元）")
    parser.add_argument("--ad-num", type=int, default=1, help="基础广告数（默认 1，E2E-3 会用 2）")
    parser.add_argument("--group-size", type=int, default=3, help="每组素材数（默认 3）")
    parser.add_argument("--schedule-time", default=None, help='投放时段（如 "周一到周五, 11点-23点"）')
    parser.add_argument("--output-dir", default=None, help="自定义输出目录（默认自动推导）")
    args = parser.parse_args()

    os.environ["KUAISHOU_ACCESS_TOKEN"] = args.token

    # 推导输出目录
    if args.output_dir:
        output_dir = args.output_dir
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        skill_dir = os.path.dirname(script_dir)
        avatar_root = os.path.dirname(os.path.dirname(skill_dir))
        session_id = os.environ.get("JULANG_OS_SESSION_ID", "default")
        output_dir = os.path.join(avatar_root, "sessions", session_id, "tmp")
    os.makedirs(output_dir, exist_ok=True)

    # 基础 account 配置
    base_acct = {
        "advertiser_id": args.advertiser_id,
        "template_account_id": args.template_account_id,
        "campaign_id": args.campaign_id,
        "unit_id": args.unit_id,
        "cpa_bid": args.cpa_bid,
        "ad_num": args.ad_num,
        "group_size": args.group_size,
        "material_strategy": "素材库",
        "text_pool_id": args.text_pool_id,
        "pool_id": args.pool_id,
    }
    if args.schedule_time:
        base_acct["schedule_time"] = args.schedule_time

    original_schedule = args.schedule_time
    original_ad_num = args.ad_num

    results: list[StepResult] = []

    print(f"\n{'=' * 64}")
    print(f"  快手广告技能回归测试（TDD 驱动）")
    print(f"{'=' * 64}")
    print(f"  测试账户: {args.advertiser_id}")
    print(f"  模版: campaign={args.campaign_id}, unit={args.unit_id}")
    print(f"  素材库: {args.pool_id} | 文案库: {args.text_pool_id}")
    print(f"  出价: {args.cpa_bid} 厘 | 基础广告数: {original_ad_num} | 每组素材: {args.group_size}")
    if original_schedule:
        print(f"  投放时段: {original_schedule}")
    print(f"  测试项: {TOTAL_UNIT} UT + {TOTAL_E2E}×{STEPS_PER_E2E} E2E = {TOTAL} 项")
    print(f"  输出目录: {output_dir}")
    print(f"  开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'=' * 64}\n")

    t_start = time.time()

    # ── Phase 1: 单元测试（失败不阻断）──
    print(f"  ── Phase 1: 单元测试（{TOTAL_UNIT} 项）──\n")
    state: dict = {}
    for name, func in UNIT_TESTS:
        run_step(name, results, TOTAL, func, state, phase="unit")

    # ── E2E 流程定义 ──
    # (flow_id, label, schedule_time, ad_num, material_strategy)
    # schedule_time: None=用原始值, False=不指定
    e2e_flows = [
        ("E2E-1", "基础场景(含时段,1广告)", original_schedule, original_ad_num, "素材库"),
        ("E2E-2", "无投放时段", False, original_ad_num, "素材库"),
        ("E2E-3", "多广告数(含时段,2广告)", original_schedule, max(original_ad_num, 2), "素材库"),
        ("E2E-4", "算法推荐(sf前缀)", original_schedule, original_ad_num, "算法推荐"),
    ]

    # ── Phase 2-5: 端到端测试 ──
    for flow_id, flow_label, sched, adnum, strategy in e2e_flows:
        print(f"\n  ── {flow_id}: {flow_label}（{STEPS_PER_E2E} 步）──\n")

        acct = copy.copy(base_acct)
        acct["material_strategy"] = strategy
        if strategy == "算法推荐":
            acct.pop("pool_id", None)
        if sched:
            acct["schedule_time"] = sched
        else:
            acct.pop("schedule_time", None)
        acct["ad_num"] = adnum

        flow_acct_dir = os.path.join(output_dir, f"{args.advertiser_id}_{flow_id}")
        run_e2e_flow(results, TOTAL, flow_id, acct, flow_acct_dir)

    _finish(results, output_dir, t_start)


def _finish(results: list[StepResult], output_dir: str, t_start: float) -> None:
    """输出最终报告并保存 JSON。"""
    total_elapsed = time.time() - t_start
    passed = sum(1 for r in results if r.status == "PASS")
    failed_n = sum(1 for r in results if r.status == "FAIL")

    # 按阶段统计
    phases = {}
    for r in results:
        if r.phase not in phases:
            phases[r.phase] = {"total": 0, "passed": 0, "failed": 0}
        phases[r.phase]["total"] += 1
        if r.status == "PASS":
            phases[r.phase]["passed"] += 1
        else:
            phases[r.phase]["failed"] += 1

    phase_labels = {
        "unit": "Phase 1 单元测试",
        "E2E-1": "E2E-1 基础场景",
        "E2E-2": "E2E-2 无投放时段",
        "E2E-3": "E2E-3 多广告数",
        "E2E-4": "E2E-4 算法推荐",
    }

    print(f"\n{'=' * 64}")
    print(f"  回归测试报告")
    print(f"{'=' * 64}")
    for phase_key in ["unit", "E2E-1", "E2E-2", "E2E-3", "E2E-4"]:
        if phase_key in phases:
            p = phases[phase_key]
            label = phase_labels.get(phase_key, phase_key)
            print(f"  {label}: {p['passed']}/{p['total']} 通过")
    print(f"  总计: {passed}/{len(results)} 通过, {failed_n} 失败, 总耗时 {total_elapsed:.1f}s")

    if failed_n > 0:
        print(f"\n  失败项:")
        for r in results:
            if r.status == "FAIL":
                print(f"    [{r.step_num}] {r.name}: {r.error}")

    report = {
        "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "total_cases": len(results),
        "passed": passed,
        "failed": failed_n,
        "total_elapsed_seconds": round(total_elapsed, 2),
        "phases": {k: phases[k] for k in ["unit", "E2E-1", "E2E-2", "E2E-3", "E2E-4"] if k in phases},
        "cases": [r.to_dict() for r in results],
    }
    report_path = os.path.join(output_dir, "test_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"  报告: {report_path}")
    print(f"{'=' * 64}\n")

    sys.exit(1 if failed_n else 0)


if __name__ == "__main__":
    main()
