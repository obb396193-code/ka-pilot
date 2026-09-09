#!/usr/bin/env python3
"""
快手广告脚本化创建 - 主入口。

读取 ad_config.json 配置文件，并发执行多账户广告创建。
每个账户独占 {output_dir}/{advertiser_id}/ 目录，互不干扰。

用法:
  python scripts/create_ads.py --config /path/to/ad_config.json
"""
from __future__ import annotations

import argparse
import json
import os
import random
import subprocess
import shutil
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# 将 scripts 目录加入 path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ensure_deps import ensure_cli_deps
from config_loader import load_config, MATERIAL_STRATEGY_ALGORITHM_AB
from template_fetcher import fetch_template
from account_context import get_account_context
from material_pipeline import run_material_pipeline, run_acquire_materials
from link_builder import build_links
from ad_creator import create_ads_123

ACCOUNT_CONCURRENCY = 10


def resolve_output_dir() -> str:
    """
    推导输出目录。
    逻辑：脚本目录上溯 2 级 → avatar 根目录 → sessions/{SESSION_ID}/tmp
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))   # .../scripts
    skill_dir = os.path.dirname(script_dir)                    # .../ks-create-ad-script
    avatar_root = os.path.dirname(os.path.dirname(skill_dir))  # .../avatars/XX
    session_id = os.environ.get("JULANG_OS_SESSION_ID", "default")
    output_dir = os.path.join(avatar_root, "sessions", session_id, "tmp")
    os.makedirs(output_dir, exist_ok=True)
    return output_dir


def process_one_account(acct: dict, acct_dir: str) -> dict:
    """
    单个账户的完整广告创建流程。

    Returns:
        dict: 执行结果
    """
    advertiser_id = acct["advertiser_id"]
    t0 = time.time()

    try:
        os.makedirs(acct_dir, exist_ok=True)
        print(f"\n{'='*60}")
        print(f"  开始处理账户: {advertiser_id}")
        print(f"{'='*60}")

        # Step A: 拉取模板参数
        template = fetch_template(
            acct["template_account_id"], acct["campaign_id"], acct["unit_id"], acct_dir
        )

        # Step B: 获取账户动态参数
        context = get_account_context(advertiser_id, acct.get("page_id"), acct_dir)

        if acct.get("material_strategy") == MATERIAL_STRATEGY_ALGORITHM_AB:
            _process_ab_strategy(acct, template, context, advertiser_id, acct_dir)
        else:
            # Step C: 素材获取与分组
            material_groups_path = run_material_pipeline(acct, template, acct_dir, context=context)

            # Step D: 素材共享/上传
            run_acquire_materials(material_groups_path, advertiser_id, acct_dir)

            # Step E: 文案获取
            _fetch_captions(acct, acct_dir)

            # Step F: 生成基建链接
            build_links(acct, context, template, acct_dir)

            # Step G: 渲染 payload
            _render_payloads(acct, template, context, acct_dir)

        # Step H: 执行创建
        create_result = create_ads_123(advertiser_id, acct_dir)

        elapsed = time.time() - t0
        result = {
            "advertiser_id": advertiser_id,
            "status": "success",
            "campaign_id": create_result["campaign_id"],
            "units_created": create_result["units_created"],
            "units_total": create_result["units_total"],
            "creatives_created": create_result["creatives_created"],
            "creatives_total": create_result["creatives_total"],
            "elapsed_seconds": round(elapsed, 1),
        }
        material_summary = _load_material_summary(acct_dir)
        if material_summary:
            result["material_summary"] = material_summary
        render_summary = _load_render_summary(acct_dir)
        if render_summary:
            result["render_summary"] = render_summary
        sig_filter_summary = _load_signature_filter_summary(acct_dir)
        if sig_filter_summary:
            result["signature_filter"] = sig_filter_summary
        if create_result.get("material_prune_warnings"):
            result["material_prune_warnings"] = create_result["material_prune_warnings"]

        # 保存账户级报告
        _dump(result, os.path.join(acct_dir, "account_report.json"))

        print(f"\n  [DONE] 账户 {advertiser_id} 完成: "
              f"campaign={create_result['campaign_id']}, "
              f"units={create_result['units_created']}/{create_result['units_total']}, "
              f"creatives={create_result['creatives_created']}/{create_result['creatives_total']}, "
              f"耗时={elapsed:.1f}s")
        return result

    except Exception as e:
        elapsed = time.time() - t0
        error_msg = str(e)
        tb = traceback.format_exc()
        stage = _infer_stage(tb)
        details = _load_stage_details(acct_dir, stage)

        result = {
            "advertiser_id": advertiser_id,
            "status": "failed",
            "error": error_msg,
            "stage": stage,
            "traceback": tb,
            "details": details,
            "elapsed_seconds": round(elapsed, 1),
        }
        report_path = os.path.join(acct_dir, "account_report.json")
        _dump(result, report_path)

        print(f"\n  [FAILED] 账户 {advertiser_id} 失败 (stage={stage})", file=sys.stderr)
        print(f"  错误: {error_msg}", file=sys.stderr)
        if details:
            print(f"  详情: {json.dumps(details, ensure_ascii=False)}", file=sys.stderr)
        print(f"  报告: {report_path}", file=sys.stderr)
        return result


def _process_ab_strategy(acct, template, context, advertiser_id, acct_dir):
    """AB策略：素材查询和算法推荐分两阶段独立处理。"""
    pool_num = acct["ad_num"] // 2
    algo_num = acct["ad_num"] - pool_num
    mg_path = os.path.join(acct_dir, "material_groups.json")

    # Step C: 素材获取 — 输出两个独立文件
    pool_path, algo_path = run_material_pipeline(acct, template, acct_dir, context=context)

    # Step E: 文案获取（两阶段共用）
    _fetch_captions(acct, acct_dir)

    # Phase 1: 素材查询
    print(f"\n  [AB] Phase 1: 素材查询 ({pool_num} 组)")
    shutil.copy2(pool_path, mg_path)
    run_acquire_materials(mg_path, advertiser_id, acct_dir)
    build_links(acct, context, template, acct_dir)
    _render_payloads(acct, template, context, acct_dir,
                     strategy_override="素材库",
                     campaign_name_prefix="ab-")

    # Phase 2: 算法推荐
    print(f"\n  [AB] Phase 2: 算法推荐 ({algo_num} 组)")
    shutil.copy2(algo_path, mg_path)
    run_acquire_materials(mg_path, advertiser_id, acct_dir)
    build_links(acct, context, template, acct_dir)
    _render_payloads(acct, template, context, acct_dir,
                     strategy_override="算法推荐",
                     start_index=pool_num + 1,
                     no_campaign=True)


def _render_payloads(acct: dict, template: dict, context: dict, acct_dir: str,
                     strategy_override: str | None = None,
                     campaign_name_prefix: str | None = None,
                     start_index: int | None = None,
                     no_campaign: bool = False) -> str:
    """
    渲染 payload（原 payload_renderer.py，inline 合并于此）。

    调用 render_from_template.py full-render 子命令生成全部 payload。
    Returns: render_manifest.json 的路径
    """
    advertiser_id = acct["advertiser_id"]
    cpa_bid = acct["cpa_bid"]
    text_pool_id = acct.get("text_pool_id", 357)
    action_bar = acct.get("action_bar")
    expose_tags = acct.get("expose_tags")
    disable_installed_app_switch = acct.get("disable_installed_app_switch")
    schedule_time = acct.get("schedule_time")
    material_strategy = strategy_override or acct.get("material_strategy")
    template_account_id = acct["template_account_id"]

    task_id = context["task_id"]
    page_id = context["page_id"]
    kol_user_id = context["kol_user_id"]

    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    render_script = os.path.join(scripts_dir, "render_from_template.py")
    if not os.path.exists(render_script):
        raise RuntimeError(f"渲染脚本缺失: {render_script}")

    cmd = [
        sys.executable, render_script, "full-render",
        "--template-campaign", os.path.join(acct_dir, "template_campaign.json"),
        "--template-unit", os.path.join(acct_dir, "template_unit.json"),
        "--template-creative", os.path.join(acct_dir, "template_creative.json"),
        "--account-id", str(advertiser_id),
        "--bid", str(int(cpa_bid)),
        "--task-id", str(task_id),
        "--page-id", str(page_id),
        "--kol-user-id", str(kol_user_id),
        "--template-account-id", str(template_account_id),
        "--text-pool-id", str(text_pool_id),
        "--tmp-dir", acct_dir,
    ]

    if action_bar:
        cmd.extend(["--action-bar", str(action_bar)])
    if expose_tags:
        cmd.extend(["--expose-tags", str(expose_tags)])
    if disable_installed_app_switch is not None:
        cmd.extend(["--disable-installed-app-switch", str(int(disable_installed_app_switch))])
    if schedule_time:
        cmd.extend(["--schedule-time", str(schedule_time)])
    if material_strategy:
        cmd.extend(["--material-strategy", str(material_strategy)])
    if campaign_name_prefix:
        cmd.extend(["--campaign-name-prefix", campaign_name_prefix])
    if start_index is not None:
        cmd.extend(["--start-index", str(start_index)])
    if no_campaign:
        cmd.append("--no-campaign")

    print(f"  [render] 渲染 payload...")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        error = result.stderr[:500] if result.stderr else result.stdout[:500]
        raise RuntimeError(f"payload 渲染失败: {error}")

    if result.stdout:
        for line in result.stdout.strip().split("\n"):
            print(f"    {line}")

    manifest_path = os.path.join(acct_dir, "render_manifest.json")
    if not os.path.exists(manifest_path):
        raise RuntimeError(f"渲染清单缺失: {manifest_path}")

    print(f"  [render] 完成 → {manifest_path}")
    return manifest_path


def _extract_caption_texts(payload) -> list:
    """从 qihang-cli textpool list 的 JSON 输出中容错提取文案文本列表。"""
    rows = []
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = data.get("list") or data.get("rows") or []
    texts = []
    for item in rows or []:
        if not item:
            continue
        if isinstance(item, str):
            texts.append(item)
        elif isinstance(item, dict):
            t = (item.get("text") or item.get("content")
                 or item.get("caption") or item.get("title"))
            if t:
                texts.append(str(t))
    return texts


def _sample_captions(input_path: str, count: int = 3) -> list:
    """从 qihang-cli textpool list 输出文件中随机采样文案。"""
    with open(input_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    texts = _extract_caption_texts(payload)
    if not texts:
        raise RuntimeError(f"输入文件无有效文案: {input_path}")
    return random.sample(texts, min(count, len(texts)))


def _fetch_captions(acct: dict, acct_dir: str) -> None:
    """获取文案（qihang-cli 拉取 + 本地随机采样，原 fetch_captions.py inline 合并）。"""
    text_pool_id = acct.get("text_pool_id", 357)
    captions_raw = os.path.join(acct_dir, "captions_raw.json")
    captions_out = os.path.join(acct_dir, "captions.json")

    print(f"  [captions] 获取文案 (pool_id={text_pool_id})...")

    # Step 1: qihang-cli textpool list
    cmd = ["qihang-cli", "textpool", "list",
           "--pool-id", str(text_pool_id),
           "--page-size", "100",
           "--output-file", captions_raw]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0 and not os.path.exists(captions_raw):
        err = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"文案获取失败 (qihang-cli textpool list): {err}")

    # Step 2: 本地随机采样
    captions = _sample_captions(captions_raw, count=3)
    with open(captions_out, "w", encoding="utf-8") as f:
        json.dump({"captions": captions}, f, ensure_ascii=False, indent=2)

    print(f"  [captions] 完成 → {captions_out}")


def _load_material_summary(acct_dir: str) -> dict | None:
    path = os.path.join(acct_dir, "uploaded_materials.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    summary = data.get("summary")
    if not isinstance(summary, dict):
        return None
    failed_entries = [
        {"signature": sig, "error": info.get("error", "")}
        for sig, info in data.get("uploads", {}).items()
        if isinstance(info, dict) and info.get("status") != "success"
    ]
    return {"summary": summary, "failed_entries": failed_entries[:20]}


def _load_render_summary(acct_dir: str) -> dict | None:
    path = os.path.join(acct_dir, "render_manifest.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return {
        "groups_rendered": len(data.get("groups_rendered", [])),
        "groups_skipped": data.get("groups_skipped", []),
    }


def _load_signature_filter_summary(acct_dir: str) -> dict | None:
    candidates = [
        os.path.join(acct_dir, "material_groups.json"),
        os.path.join(acct_dir, "material_groups_pool.json"),
        os.path.join(acct_dir, "material_groups_algo.json"),
    ]
    summaries = []
    for path in candidates:
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        sf = data.get("signature_filter")
        if isinstance(sf, dict):
            summaries.append(sf)
    if not summaries:
        return None
    if len(summaries) == 1:
        return summaries[0]
    total = sum(s.get("total", 0) for s in summaries)
    passed = sum(s.get("passed", 0) for s in summaries)
    filtered = sum(s.get("filtered", 0) for s in summaries)
    threshold = summaries[0].get("threshold", 10)
    seen = set()
    deduped = []
    for s in summaries:
        for item in s.get("filtered_signatures", []):
            sig = item.get("signature", "")
            if sig and sig not in seen:
                seen.add(sig)
                deduped.append(item)
    return {
        "total": total,
        "passed": passed,
        "filtered": filtered,
        "threshold": threshold,
        "filtered_signatures": deduped,
    }


def _load_stage_details(acct_dir: str, stage: str) -> dict | None:
    """加载失败阶段的结构化详情，便于 Agent 完整汇报。"""
    candidates = {
        "create": ["unit_results.json", "creative_results.json"],
        "material": ["uploaded_materials.json"],
        "link": ["links.json"],
        "render": ["render_manifest.json"],
    }
    for filename in candidates.get(stage, []):
        path = os.path.join(acct_dir, filename)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        if stage == "create" and isinstance(data, dict) and "summary" in data:
            failed_items = [
                {
                    "idx": item.get("idx"),
                    "file": item.get("file"),
                    "error": item.get("error"),
                    "error_kind": item.get("error_kind"),
                    "fix_layer": item.get("fix_layer"),
                }
                for item in data.get("results", [])
                if isinstance(item, dict) and item.get("status") == "failed"
            ]
            return {
                "file": filename,
                "summary": data.get("summary"),
                "failed_items": failed_items,
            }
        if stage == "material" and isinstance(data, dict) and "summary" in data:
            return {"file": filename, "summary": data.get("summary")}
        return {"file": filename, "data": data}
    return None


def _infer_stage(tb: str) -> str:
    """从 traceback 推断失败阶段。"""
    if "template_fetcher" in tb:
        return "template"
    elif "account_context" in tb:
        return "context"
    elif "material_pipeline" in tb or "acquire_materials" in tb:
        return "material"
    elif "link_builder" in tb:
        return "link"
    elif "_render_payloads" in tb or "render_from_template" in tb:
        return "render"
    elif "ad_creator" in tb:
        return "create"
    elif "_fetch_captions" in tb:
        return "captions"
    return "unknown"


def _dump(obj, path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="快手广告脚本化创建 - 主入口")
    parser.add_argument("--config", required=True, help="ad_config.json 配置文件路径")
    parser.add_argument("--output-dir", default=None, help="输出目录（默认自动推导）")
    args = parser.parse_args()

    # 检测并安装缺失的 CLI 依赖
    ensure_cli_deps(["kuaishou-cli", "qihang-cli", "qihang-ks-cli", "algorithm-cli"])

    # 加载配置
    config = load_config(args.config)
    accounts = config["accounts"]
    concurrency = ACCOUNT_CONCURRENCY

    # 推导输出目录
    output_dir = args.output_dir or resolve_output_dir()
    os.makedirs(output_dir, exist_ok=True)

    print(f"=== 快手广告脚本化创建 ===")
    print(f"配置文件: {args.config}")
    print(f"输出目录: {output_dir}")
    print(f"账户数: {len(accounts)}")
    print(f"并发度: {concurrency}")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 并发执行
    results = []
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {}
        for acct in accounts:
            acct_dir = os.path.join(output_dir, str(acct["advertiser_id"]))
            future = pool.submit(process_one_account, acct, acct_dir)
            futures[future] = acct["advertiser_id"]

        for future in as_completed(futures):
            result = future.result()
            results.append(result)

    # 汇总报告
    success_count = sum(1 for r in results if r["status"] == "success")
    failed_count = len(results) - success_count

    report = {
        "timestamp": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "config_file": os.path.abspath(args.config),
        "output_dir": output_dir,
        "total_accounts": len(results),
        "success": success_count,
        "failed": failed_count,
        "results": results,
    }

    report_path = os.path.join(output_dir, "report.json")
    _dump(report, report_path)

    # 打印汇总
    print(f"\n{'='*60}")
    print(f"  === 执行完成 ===")
    print(f"  总账户: {len(results)}")
    print(f"  成功: {success_count}")
    print(f"  失败: {failed_count}")
    print(f"  报告: {report_path}")
    print(f"{'='*60}")

    for r in results:
        if r["status"] == "success":
            print(f"  [OK] {r['advertiser_id']}: campaign={r['campaign_id']}, "
                  f"units={r['units_created']}/{r['units_total']}, "
                  f"creatives={r['creatives_created']}/{r['creatives_total']}")
        else:
            print(f"  [FAIL] {r['advertiser_id']}: stage={r['stage']}")
            print(f"         error: {r['error']}")

    sys.exit(0 if failed_count == 0 else 1)


if __name__ == "__main__":
    main()
