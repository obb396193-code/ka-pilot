#!/usr/bin/env python3
"""
账户动态参数获取。

为目标账户获取 task_id、kol_user_id、page_id、track_suffix 等运行时参数。
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import run_cli_with_retry

ACCOUNT_TASK_API = "https://private-dataservice-api.dw.alibaba-inc.com/ds-tb-erfangyinliu/project/23017/account_task"
APP_CODE = "E1A16AACB57E4B07BD3532FC1CAA7330"
HTTP_TIMEOUT = 30


def get_account_context(advertiser_id: str, page_id_override: str, acct_dir: str,
                        kol_user_id_override: int = None) -> dict:
    """
    获取账户动态参数。

    Args:
        kol_user_id_override: 配置文件中直传的 kol_user_id（可选，为空则自动查询）

    Returns:
        dict: {task_id, kol_user_id, page_id, track_suffix, begin_time}
    """
    os.makedirs(acct_dir, exist_ok=True)

    # Step 1: 获取 task_id
    print(f"  [context] 获取 task_id...")
    task_id = _get_task_id(advertiser_id)
    print(f"  [context] task_id={task_id}")

    # Step 2: 获取任务信息 (page_id + track_suffix)
    print(f"  [context] 获取任务信息...")
    task_info = _get_task_info(task_id, acct_dir)
    page_id = page_id_override or task_info.get("page_id")
    track_suffix = task_info.get("track_suffix", "")
    if not page_id:
        raise RuntimeError(f"无法获取 page_id (advertiser={advertiser_id}, task_id={task_id})")
    print(f"  [context] page_id={page_id}")

    # Step 3: 获取 kol_user_id
    if kol_user_id_override:
        kol_user_id = int(kol_user_id_override)
        print(f"  [context] kol_user_id={kol_user_id} (来自配置)")
    else:
        print(f"  [context] 获取 kol_user_id...")
        kol_user_id = _get_kol_user_id(advertiser_id)
        print(f"  [context] kol_user_id={kol_user_id}")

    # Step 4: begin_time
    begin_time = date.today().strftime("%Y-%m-%d")

    context = {
        "task_id": task_id,
        "kol_user_id": kol_user_id,
        "page_id": page_id,
        "track_suffix": track_suffix,
        "begin_time": begin_time,
    }

    # 持久化
    ctx_path = os.path.join(acct_dir, "account_context.json")
    with open(ctx_path, "w", encoding="utf-8") as f:
        json.dump(context, f, ensure_ascii=False, indent=2)

    return context


def _get_task_id(advertiser_id: str) -> str:
    """通过 dataservice API 查询 task_id。"""
    url = f"{ACCOUNT_TASK_API}?appCode={APP_CODE}&media=KUAISHOU&account_id={advertiser_id}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"task_id 查询失败 (advertiser={advertiser_id}): {e}")

    records = data.get("data") or []
    if not records:
        raise RuntimeError(f"task_id 查询无结果 (advertiser={advertiser_id})")
    return str(records[0].get("task_id"))


def _get_task_info(task_id: str, acct_dir: str) -> dict:
    """通过 qihang-cli 获取任务信息。"""
    output_file = os.path.join(acct_dir, f"task_info_{task_id}.json")
    cmd = ["qihang-ks-cli", "kuaishou-task", "get", "--task-id", task_id, "--output-file", output_file]
    try:
        run_cli_with_retry(cmd, timeout=30)
    except RuntimeError as e:
        raise RuntimeError(f"任务信息获取失败 (task_id={task_id}): {e}")

    with open(output_file, "r", encoding="utf-8") as f:
        resp = json.load(f)

    # 响应结构: {data: [...], errCode, errMsg}
    records = resp.get("data") or []
    task_data = records[0] if records else {}

    # 提取 page_id
    page_id = _extract_page_id(task_data)

    # 提取 track_suffix（仅 ocpx_action_type=180 激活目标时会附加到链接）
    track_suffix = task_data.get("camouflage_activation_parameters") or ""

    return {"page_id": page_id, "track_suffix": track_suffix}


def _extract_page_id(task_data: dict) -> str:
    """从任务信息的 page 字段提取 landing_v2_xxx 格式的承接页 ID。"""
    page_raw = task_data.get("page") or ""
    if not page_raw:
        return ""
    # page 字段可能含中文描述，如 "landing_v2_12345（承接页A）,landing_v2_67890（承接页B）"
    parts = page_raw.split(",")
    for part in parts:
        match = re.search(r"(landing_v2_\w+)", part)
        if match:
            return match.group(1)
    return ""


def _get_kol_user_id(advertiser_id: str) -> int:
    """获取目标账户的 kol_user_id（通过 kuaishou-cli native auth-list 查询原生授权达人）。"""
    cmd = [
        "kuaishou-cli", "--advertiser-id", str(advertiser_id),
        "native", "auth-list", "--kol-user-type", "1"
    ]
    try:
        result = run_cli_with_retry(cmd, timeout=30)
    except RuntimeError as e:
        raise RuntimeError(f"kol_user_id 获取失败 (advertiser={advertiser_id}): {e}")

    # 解析: data.data[0].user_info.user_id 或 data[0].user_info.user_id
    data = result
    if isinstance(data, dict):
        inner = data.get("data")
        if isinstance(inner, dict):
            inner = inner.get("data")
        if isinstance(inner, list) and inner:
            first = inner[0]
            user_info = first.get("user_info") or first
            uid = user_info.get("user_id")
            if uid:
                return int(uid)

    raise RuntimeError(f"kol_user_id 解析失败 (advertiser={advertiser_id}), 请确认账户已完成原生广告授权")
