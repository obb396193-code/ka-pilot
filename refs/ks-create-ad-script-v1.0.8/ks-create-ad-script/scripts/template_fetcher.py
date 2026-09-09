#!/usr/bin/env python3
"""
模板 123 级参数拉取。

通过 kuaishou-cli 从模版账户拉取一级(campaign)、二级(unit)、三级(creative)的完整参数。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cli_with_retry


def fetch_template(template_account_id: str, campaign_id: int, unit_id: int, acct_dir: str) -> dict:
    """
    拉取模版 123 级参数并保存到 acct_dir。

    Returns:
        dict: {"campaign": {...}, "unit": {...}, "creative": {...}}
    """
    os.makedirs(acct_dir, exist_ok=True)

    # 拉取一级
    print(f"  [template] 拉取一级 campaign_id={campaign_id}...")
    campaign_raw = _fetch_cli(
        template_account_id, "campaign", "get", f"--campaign-id {campaign_id}"
    )
    campaign_path = os.path.join(acct_dir, "template_campaign.json")
    _dump(campaign_raw, campaign_path)

    # 拉取二级
    print(f"  [template] 拉取二级 unit_id={unit_id}...")
    unit_raw = _fetch_cli(
        template_account_id, "unit", "get", f"--unit-id {unit_id}"
    )
    unit_path = os.path.join(acct_dir, "template_unit.json")
    _dump(unit_raw, unit_path)

    # 拉取三级
    print(f"  [template] 拉取三级 (program-list)...")
    creative_raw = _fetch_cli(
        template_account_id, "creative", "program-list", f"--unit-id {unit_id}"
    )
    creative_path = os.path.join(acct_dir, "template_creative.json")
    _dump(creative_raw, creative_path)

    # 解析提取核心数据
    campaign = _extract_detail(campaign_raw)
    unit = _extract_detail(unit_raw)
    creative = _extract_creative(creative_raw)

    return {"campaign": campaign, "unit": unit, "creative": creative}


def _fetch_cli(advertiser_id: str, entity: str, action: str, extra_args: str) -> dict:
    """调用 kuaishou-cli 并返回原始 JSON。"""
    cmd = ["kuaishou-cli", "--advertiser-id", str(advertiser_id), entity, action]
    cmd.extend(extra_args.split())
    result = run_cli_with_retry(cmd, timeout=30)
    if isinstance(result, dict):
        return result
    return {"data": result}


def _extract_detail(raw: dict) -> dict:
    """从 API 响应中提取 details[0]。"""
    if "data" in raw and isinstance(raw["data"], dict):
        details = raw["data"].get("details")
        if isinstance(details, list) and details:
            return details[0]
        return raw["data"]
    if "details" in raw:
        details = raw["details"]
        if isinstance(details, list) and details:
            return details[0]
    return raw


def _extract_creative(raw: dict) -> dict:
    """从三级响应中提取首条 creative。"""
    if "data" in raw and isinstance(raw["data"], dict):
        details = raw["data"].get("details")
        if isinstance(details, list) and details:
            return details[0]
    if "details" in raw:
        details = raw["details"]
        if isinstance(details, list) and details:
            return details[0]
    return raw


def _dump(obj, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
