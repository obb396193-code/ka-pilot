#!/usr/bin/env python3
"""
配置文件加载与校验。

配置结构：扁平化到 account 维度，每个 account 自包含全部参数。
"""
import json
import re
import sys
from pathlib import Path

DEFAULT_GROUP_SIZE = 15

MATERIAL_STRATEGY_POOL = "素材库"
MATERIAL_STRATEGY_CUSTOM = "自定义"
MATERIAL_STRATEGY_ALGORITHM = "算法推荐"
MATERIAL_STRATEGY_ALGORITHM_AB = "算法推荐AB"
REMOVED_MATERIAL_STRATEGIES = frozenset({"默认", "素材洞察"})
ALLOWED_MATERIAL_STRATEGIES = frozenset({
    MATERIAL_STRATEGY_POOL,
    MATERIAL_STRATEGY_CUSTOM,
    MATERIAL_STRATEGY_ALGORITHM,
    MATERIAL_STRATEGY_ALGORITHM_AB,
})

REQUIRED_FIELDS = [
    "advertiser_id",
    "template_account_id",
    "campaign_id",
    "unit_id",
    "cpa_bid",
    "ad_num",
    "group_size",
    "material_strategy",
    "text_pool_id",
]

def parse_pool_ids(raw) -> list[str]:
    """将 pool_id / pool_ids 配置归一化为非空 ID 列表（字符串）。"""
    if raw is None:
        return []
    if isinstance(raw, bool):
        return []
    if isinstance(raw, int):
        return [str(raw)]
    if isinstance(raw, list):
        ids: list[str] = []
        for item in raw:
            ids.extend(parse_pool_ids(item))
        return ids
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        parts = re.split(r"[\s,;]+", text)
        return [p for p in (part.strip() for part in parts) if p]
    text = str(raw).strip()
    return [text] if text else []


def resolve_pool_ids(acct: dict) -> list[str]:
    """解析账户素材库 ID；pool_id 与 pool_ids 可同时存在，合并去重（pool_id 在前）。"""
    merged: list[str] = []
    if acct.get("pool_id") is not None:
        merged.extend(parse_pool_ids(acct["pool_id"]))
    if acct.get("pool_ids") is not None:
        merged.extend(parse_pool_ids(acct["pool_ids"]))
    seen: set[str] = set()
    out: list[str] = []
    for pid in merged:
        if pid not in seen:
            seen.add(pid)
            out.append(pid)
    return out


def load_config(config_path: str) -> dict:
    """加载并校验配置文件。"""
    path = Path(config_path)
    if not path.exists():
        print(f"[ERROR] 配置文件不存在: {config_path}", file=sys.stderr)
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        config = json.load(f)

    _validate(config)
    return config


def _validate(config: dict) -> None:
    """校验配置合法性。"""
    if not isinstance(config, dict):
        _abort("配置文件顶层必须是 JSON object")

    accounts = config.get("accounts")
    if not accounts or not isinstance(accounts, list):
        _abort("缺少 accounts 数组或为空")

    # 校验 advertiser_id 无重复
    adv_ids = [acct.get("advertiser_id") for acct in accounts]
    duplicates = [aid for aid in set(adv_ids) if adv_ids.count(aid) > 1]
    if duplicates:
        _abort(f"accounts 中 advertiser_id 重复: {duplicates}")

    # 校验每个 account 必填字段
    for i, acct in enumerate(accounts):
        if acct.get("group_size") is None:
            acct["group_size"] = DEFAULT_GROUP_SIZE

        for field in REQUIRED_FIELDS:
            if field not in acct or acct[field] is None:
                _abort(f"accounts[{i}] (advertiser_id={acct.get('advertiser_id', '?')}) 缺少必填字段: {field}")

        _validate_material_strategy(i, acct)

        # cpa_bid 类型校验
        if not isinstance(acct.get("cpa_bid"), (int, float)):
            _abort(f"accounts[{i}] cpa_bid 必须为数值")

        # ad_num / group_size 类型校验
        if not isinstance(acct.get("ad_num"), int) or acct["ad_num"] < 1:
            _abort(f"accounts[{i}] ad_num 必须为正整数")
        if not isinstance(acct.get("group_size"), int) or acct["group_size"] < 1:
            _abort(f"accounts[{i}] group_size 必须为正整数")

        switch = acct.get("disable_installed_app_switch")
        if switch is not None and switch not in (0, 1):
            _abort(
                f"accounts[{i}] (advertiser_id={acct.get('advertiser_id', '?')}) "
                f"disable_installed_app_switch 必须为 0（未开启）或 1（开启）"
            )

        # 投放时段校验（可选字段）
        schedule_time = acct.get("schedule_time")
        if schedule_time is not None:
            if not isinstance(schedule_time, str) or not schedule_time.strip():
                _abort(
                    f"accounts[{i}] (advertiser_id={acct.get('advertiser_id', '?')}) "
                    f"schedule_time 必须为非空字符串"
                )
            try:
                from schedule_utils import parse_schedule_time
                parse_schedule_time(schedule_time)
            except ValueError as exc:
                _abort(
                    f"accounts[{i}] (advertiser_id={acct.get('advertiser_id', '?')}) "
                    f"schedule_time 格式无效: {exc}"
                )


def _validate_material_strategy(index: int, acct: dict) -> None:
    """校验素材策略。"""
    adv = acct.get("advertiser_id", "?")
    strategy = acct.get("material_strategy")

    if strategy in REMOVED_MATERIAL_STRATEGIES:
        _abort(
            f"accounts[{index}] (advertiser_id={adv}) 素材策略「{strategy}」已下线，"
            f"请改用「{MATERIAL_STRATEGY_POOL}」"
        )

    if strategy not in ALLOWED_MATERIAL_STRATEGIES:
        _abort(
            f"accounts[{index}] (advertiser_id={adv}) material_strategy 无效: {strategy!r}，"
            f"可选: {MATERIAL_STRATEGY_POOL}、{MATERIAL_STRATEGY_CUSTOM}、"
            f"{MATERIAL_STRATEGY_ALGORITHM}、{MATERIAL_STRATEGY_ALGORITHM_AB}"
        )

    if strategy in (MATERIAL_STRATEGY_POOL, MATERIAL_STRATEGY_ALGORITHM_AB) and not resolve_pool_ids(acct):
        _abort(
            f"accounts[{index}] (advertiser_id={adv}) "
            f"策略「{strategy}」需要 pool_id / pool_ids"
        )

    if strategy == MATERIAL_STRATEGY_CUSTOM:
        mat_file = acct.get("custom_materials_file")
        if not mat_file or not str(mat_file).strip():
            _abort(
                f"accounts[{index}] (advertiser_id={adv}) 自定义策略但未提供 custom_materials_file"
            )
        path = Path(str(mat_file)).expanduser()
        if not path.is_file():
            _abort(
                f"accounts[{index}] (advertiser_id={adv}) custom_materials_file 不存在: {path}"
            )
        if path.suffix.lower() != ".json":
            _abort(
                f"accounts[{index}] (advertiser_id={adv}) custom_materials_file 必须是 .json: {path}"
            )


def _abort(msg: str) -> None:
    """校验失败，打印错误并退出。"""
    print(f"[CONFIG ERROR] {msg}", file=sys.stderr)
    sys.exit(1)
