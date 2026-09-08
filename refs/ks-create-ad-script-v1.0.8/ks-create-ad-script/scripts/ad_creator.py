#!/usr/bin/env python3
"""
123 级广告创建执行。

按顺序创建一级 → 回填 campaign_id → 批量创建二级 → 回填 unit_ids → 批量创建三级。
复用 batch_create.py 和 render_from_template.py 的辅助命令。
"""
import glob
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cli_with_retry
from creative_material_retry import retry_creatives_with_material_prune


def create_ads_123(advertiser_id: str, acct_dir: str) -> dict:
    """
    执行 123 级广告创建。

    Returns:
        dict: {campaign_id, units_created, creatives_created, unit_results, creative_results}
    """
    scripts_dir = os.path.dirname(os.path.abspath(__file__))

    # === Step 1: 创建一级 ===
    print(f"  [create] 创建一级广告...")
    campaign_payload = os.path.join(acct_dir, "campaign_payload.json")
    if not os.path.exists(campaign_payload):
        raise RuntimeError(f"一级 payload 缺失: {campaign_payload}")

    campaign_id = _create_campaign(advertiser_id, campaign_payload)
    print(f"  [create] 一级创建成功: campaign_id={campaign_id}")

    # === Step 2: 回填 campaign_id 到二级 ===
    _fill_campaign_id(campaign_id, acct_dir, scripts_dir)

    # === Step 3: 批量创建二级 ===
    print(f"  [create] 批量创建二级广告...")
    unit_results_path = os.path.join(acct_dir, "unit_results.json")
    unit_payloads = os.path.join(acct_dir, "unit_payload_*.json")

    _batch_create(advertiser_id, "unit create", unit_payloads, unit_results_path, scripts_dir)

    # 统计二级结果
    with open(unit_results_path, "r", encoding="utf-8") as f:
        unit_results = json.load(f)
    units_success = unit_results["summary"]["success"]
    units_total = unit_results["summary"]["total"]
    units_failed = unit_results["summary"]["failed"]
    print(f"  [create] 二级完成: {units_success}/{units_total} 成功")

    if units_failed > 0:
        raise RuntimeError(_format_batch_failure("二级", unit_results))

    if units_success == 0:
        raise RuntimeError(f"二级全部失败 ({units_total} 组)")

    # === Step 4: 回填 unit_ids 到三级 ===
    _fill_unit_ids(unit_results_path, acct_dir, scripts_dir)

    # === Step 5: 批量创建三级 ===
    print(f"  [create] 批量创建三级创意...")
    creative_results_path = os.path.join(acct_dir, "creative_results.json")
    creative_payloads = os.path.join(acct_dir, "creative_payload_*.json")

    _batch_create(advertiser_id, "creative create-program", creative_payloads, creative_results_path, scripts_dir)

    # 统计三级结果；material 层失败时剔除问题素材并重试
    with open(creative_results_path, "r", encoding="utf-8") as f:
        creative_results = json.load(f)

    material_prune_warnings: list = []
    if creative_results["summary"]["failed"] > 0:
        creative_results, material_prune_warnings = retry_creatives_with_material_prune(
            advertiser_id, acct_dir, creative_results,
        )
        with open(creative_results_path, "w", encoding="utf-8") as f:
            json.dump(creative_results, f, ensure_ascii=False, indent=2)

    creatives_success = creative_results["summary"]["success"]
    creatives_total = creative_results["summary"]["total"]
    creatives_failed = creative_results["summary"]["failed"]
    if material_prune_warnings:
        pruned_ok = sum(1 for r in creative_results["results"] if r.get("recovered_after_prune"))
        print(f"  [create] 素材剔除重试: 恢复 {pruned_ok} 组, WARN {len(material_prune_warnings)} 条")
    print(f"  [create] 三级完成: {creatives_success}/{creatives_total} 成功")

    if creatives_failed > 0:
        raise RuntimeError(_format_batch_failure("三级", creative_results))

    result = {
        "campaign_id": campaign_id,
        "units_created": units_success,
        "units_total": units_total,
        "creatives_created": creatives_success,
        "creatives_total": creatives_total,
    }
    if material_prune_warnings:
        result["material_prune_warnings"] = material_prune_warnings
    return result


def _format_batch_failure(level: str, results: dict) -> str:
    """格式化批量创建失败信息，包含每条失败的具体原因。"""
    summary = results.get("summary", {})
    breakdown = summary.get("failure_breakdown", {})
    failed_items = [
        item for item in results.get("results", [])
        if isinstance(item, dict) and item.get("status") == "failed"
    ]
    lines = [
        f"{level}创建部分失败: 成功={summary.get('success')}, 失败={summary.get('failed')}, 总计={summary.get('total')}",
    ]
    if breakdown:
        lines.append(f"failure_breakdown={json.dumps(breakdown, ensure_ascii=False)}")
    for item in failed_items[:10]:
        lines.append(
            f"  idx={item.get('idx')} file={item.get('file')} "
            f"error_kind={item.get('error_kind')} fix_layer={item.get('fix_layer')} "
            f"error={item.get('error')}"
        )
    if len(failed_items) > 10:
        lines.append(f"  ... 另有 {len(failed_items) - 10} 条失败，详见 unit_results.json / creative_results.json")
    return "\n".join(lines)


def _create_campaign(advertiser_id: str, payload_path: str) -> int:
    """创建一级广告并返回 campaign_id。"""
    cmd = [
        "kuaishou-cli", "--advertiser-id", str(advertiser_id),
        "--output", "json",
        "campaign", "create", "-f", payload_path,
    ]
    try:
        result = run_cli_with_retry(cmd, timeout=30)
    except RuntimeError as e:
        raise RuntimeError(f"一级创建失败: {e}")

    # 提取 campaign_id
    if isinstance(result, dict):
        cid = result.get("campaign_id")
        if not cid and "data" in result:
            cid = result["data"].get("campaign_id") if isinstance(result["data"], dict) else None
        if cid:
            return int(cid)

    raise RuntimeError(f"一级创建成功但无法提取 campaign_id: {result}")


def _fill_campaign_id(campaign_id: int, acct_dir: str, scripts_dir: str) -> None:
    """回填 campaign_id 到所有 unit_payload。"""
    cmd = [
        sys.executable, os.path.join(scripts_dir, "render_from_template.py"),
        "fill-campaign-id",
        "--campaign-id", str(campaign_id),
        "--tmp-dir", acct_dir,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        raise RuntimeError(f"回填 campaign_id 失败: {result.stderr[:200]}")


def _fill_unit_ids(unit_results_path: str, acct_dir: str, scripts_dir: str) -> None:
    """从二级结果提取 unit_ids 并回填到三级 payload。"""
    # 先提取 idx:unit_id 映射
    extract_cmd = [
        sys.executable, os.path.join(scripts_dir, "render_from_template.py"),
        "extract-unit-ids",
        "--results-file", unit_results_path,
    ]
    result = subprocess.run(extract_cmd, capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        raise RuntimeError(f"提取 unit_ids 失败: {result.stderr[:200]}")

    unit_ids_str = result.stdout.strip()
    if not unit_ids_str:
        raise RuntimeError("提取 unit_ids 为空")

    # 回填
    fill_cmd = [
        sys.executable, os.path.join(scripts_dir, "render_from_template.py"),
        "fill-unit-ids",
        "--unit-ids", unit_ids_str,
        "--tmp-dir", acct_dir,
    ]
    result = subprocess.run(fill_cmd, capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        raise RuntimeError(f"回填 unit_ids 失败: {result.stderr[:200]}")


def _batch_create(advertiser_id: str, command: str, payloads_glob: str,
                  output_path: str, scripts_dir: str) -> None:
    """调用 batch_create.py 批量创建。"""
    batch_script = os.path.join(scripts_dir, "batch_create.py")
    cmd = [
        sys.executable, batch_script,
        "--advertiser-id", str(advertiser_id),
        "--command", command,
        "--payloads", payloads_glob,
        "--concurrency", "5",
        "--output", output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if not os.path.exists(output_path):
        err = (result.stderr or result.stdout or "未知错误").strip()
        raise RuntimeError(f"批量创建失败（无输出文件 {output_path}）: {err}")
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()
        print(
            f"  [create] batch_create 返回非零 (exit={result.returncode}): {err}",
            file=sys.stderr,
        )
