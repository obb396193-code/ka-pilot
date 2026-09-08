#!/usr/bin/env python3
"""
素材全流程编排：分组 → 共享/上传。

根据 material_strategy 调用素材获取路径：
- "素材库"：group_materials_pool.py 从素材库圈选
- "自定义"：group_materials_custom.py 从 custom_materials_file 分组
- "算法推荐"：group_materials_algorithm.py 从算法系统按 predict_score 圈选
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config_loader import (
    MATERIAL_STRATEGY_ALGORITHM,
    MATERIAL_STRATEGY_ALGORITHM_AB,
    MATERIAL_STRATEGY_CUSTOM,
    MATERIAL_STRATEGY_POOL,
    REMOVED_MATERIAL_STRATEGIES,
    resolve_pool_ids,
)


def run_material_pipeline(acct: dict, template: dict, acct_dir: str,
                          context: dict | None = None) -> str | tuple[str, str]:
    """
    执行素材获取与分组流程。

    Returns:
        str: material_groups.json 的路径（普通策略）
        tuple[str, str]: (pool路径, algo路径)（AB策略）
    """
    strategy = acct.get("material_strategy")
    _ensure_material_strategy_supported(strategy)

    ad_num = acct["ad_num"]
    group_size = acct["group_size"]

    # 从模版提取 scene_ids
    scene_ids = template["unit"].get("scene_id") or []
    scene_ids_str = ",".join(str(s) for s in scene_ids) if scene_ids else ""

    if strategy == MATERIAL_STRATEGY_ALGORITHM_AB:
        return _run_algorithm_ab_strategy(
            acct, ad_num, group_size, scene_ids, scene_ids_str, context, acct_dir,
        )

    output_path = os.path.join(acct_dir, "material_groups.json")

    if strategy == MATERIAL_STRATEGY_POOL:
        _run_pool_strategy(acct, ad_num, group_size, scene_ids_str, output_path)
    elif strategy == MATERIAL_STRATEGY_CUSTOM:
        _run_custom_strategy(acct, ad_num, group_size, acct_dir, output_path)
    elif strategy == MATERIAL_STRATEGY_ALGORITHM:
        _run_algorithm_strategy(ad_num, group_size, scene_ids, context, output_path)
    else:
        raise RuntimeError(f"不支持的素材策略: {strategy!r}")

    # 验证输出
    if not os.path.exists(output_path):
        raise RuntimeError(f"素材分组输出缺失: {output_path}")

    with open(output_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    groups = data.get("groups", [])
    if not groups:
        raise RuntimeError("素材分组结果为空")

    print(f"  [material] 分组完成: {len(groups)} 组")
    return output_path


def _ensure_material_strategy_supported(strategy: str) -> None:
    if strategy in REMOVED_MATERIAL_STRATEGIES:
        raise RuntimeError(
            f"素材策略「{strategy}」已下线，请改用「{MATERIAL_STRATEGY_POOL}」"
        )
    if strategy not in (MATERIAL_STRATEGY_POOL, MATERIAL_STRATEGY_CUSTOM,
                        MATERIAL_STRATEGY_ALGORITHM, MATERIAL_STRATEGY_ALGORITHM_AB):
        raise RuntimeError(
            f"不支持的素材策略: {strategy!r}，当前支持「{MATERIAL_STRATEGY_POOL}」"
            f"「{MATERIAL_STRATEGY_CUSTOM}」「{MATERIAL_STRATEGY_ALGORITHM}」"
        )


def run_acquire_materials(material_groups_path: str, advertiser_id: str, acct_dir: str) -> str:
    """
    素材共享/上传流程（直接 import 调用，无 subprocess 开销）。

    Returns:
        str: uploaded_materials.json 的路径
    """
    from acquire_materials import run_acquire

    output_path = os.path.join(acct_dir, "uploaded_materials.json")
    summary = run_acquire(material_groups_path, output_path, str(advertiser_id))

    failed_n = summary.get("failed", 0)
    success_n = summary.get("total", 0) - failed_n
    if failed_n > 0:
        print(
            f"  [material] 共享/上传完成: 成功={success_n}, 失败={failed_n}（失败素材已忽略）"
        )
    else:
        print(f"  [material] 共享/上传完成: 成功={success_n}")
    print(f"  [material] → {output_path}")
    return output_path


def _run_pool_strategy(acct: dict, ad_num: int, group_size: int,
                       scene_ids_str: str, output_path: str) -> None:
    """素材库策略：从素材库圈选。"""
    pool_ids = resolve_pool_ids(acct)
    pools_label = ",".join(pool_ids)
    print(f"  [material] 素材库策略 pool_ids={pools_label} (target={ad_num}, size={group_size})...")
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    cmd = [
        sys.executable, os.path.join(scripts_dir, "group_materials_pool.py"),
        "--pool-id", *pool_ids,
        "--target-groups", str(ad_num),
        "--group-size", str(group_size),
        "--output", output_path,
    ]
    if scene_ids_str:
        cmd.extend(["--scene-ids", scene_ids_str])

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.stdout:
        for line in result.stdout.strip().splitlines():
            print(f"    {line}")
    if result.returncode != 0:
        raise RuntimeError(f"素材库圈选失败: {result.stderr[:500]}")


def _run_custom_strategy(acct: dict, ad_num: int, group_size: int,
                         acct_dir: str, output_path: str) -> None:
    """自定义策略：从 custom_materials_file 分组。"""
    mat_file = os.path.abspath(os.path.expanduser(acct["custom_materials_file"]))
    normalized_path = os.path.join(acct_dir, "custom_materials_normalized.json")
    print(f"  [material] 自定义策略 file={mat_file} (target={ad_num}, size={group_size})...")
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    cmd = [
        sys.executable, os.path.join(scripts_dir, "group_materials_custom.py"),
        "--input", mat_file,
        "--target-groups", str(ad_num),
        "--group-size", str(group_size),
        "--output", output_path,
        "--normalized-output", normalized_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.stdout:
        for line in result.stdout.strip().splitlines():
            print(f"    {line}")
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "")[:500]
        raise RuntimeError(f"自定义素材分组失败: {err}")


def _run_algorithm_strategy(ad_num: int, group_size: int,
                            scene_ids: list, context: dict | None,
                            output_path: str) -> None:
    """算法推荐策略：从算法系统按 predict_score 圈选。"""
    if not context or not context.get("page_id"):
        raise RuntimeError("算法推荐策略需要 page_id（来自账户上下文），但未获取到")
    page_id = context["page_id"]
    csites = [str(s) for s in scene_ids] if scene_ids else []
    if not csites:
        raise RuntimeError("算法推荐策略需要模版 scene_id 列表（映射 csite），但模版未提供")
    csites_str = ",".join(csites)
    print(f"  [material] 算法推荐策略 page_id={page_id} csites={csites_str} "
          f"(target={ad_num}, size={group_size})...")
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    cmd = [
        sys.executable, os.path.join(scripts_dir, "group_materials_algorithm.py"),
        "--delivery-page-id", page_id,
        "--csites", csites_str,
        "--target-groups", str(ad_num),
        "--group-size", str(group_size),
        "--output", output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.stdout:
        for line in result.stdout.strip().splitlines():
            print(f"    {line}")
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "")[:500]
        raise RuntimeError(f"算法推荐素材圈选失败: {err}")


def _run_algorithm_ab_strategy(acct: dict, ad_num: int, group_size: int,
                                scene_ids: list, scene_ids_str: str,
                                context: dict | None,
                                acct_dir: str) -> tuple[str, str]:
    """AB策略：50% 素材库 + 50% 算法推荐，输出两个独立文件。"""
    pool_num = ad_num // 2
    algo_num = ad_num - pool_num
    print(f"  [material] AB策略: pool={pool_num}, algo={algo_num}")

    pool_output = os.path.join(acct_dir, "material_groups_pool.json")
    algo_output = os.path.join(acct_dir, "material_groups_algo.json")

    _run_pool_strategy(acct, pool_num, group_size, scene_ids_str, pool_output)
    _run_algorithm_strategy(algo_num, group_size, scene_ids, context, algo_output)

    for path, label in ((pool_output, "素材库"), (algo_output, "算法推荐")):
        if not os.path.exists(path):
            raise RuntimeError(f"AB {label} 分组输出缺失: {path}")
        with open(path, "r", encoding="utf-8") as f:
            groups = json.load(f).get("groups", [])
        if not groups:
            raise RuntimeError(f"AB {label} 分组结果为空")
        print(f"  [material] AB-{label}: {len(groups)} 组")

    return pool_output, algo_output
