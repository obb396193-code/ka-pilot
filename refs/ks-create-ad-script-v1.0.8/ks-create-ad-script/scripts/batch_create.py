#!/usr/bin/env python3
"""
批量并发创建快手广告（二级/三级通用）。

替代 SKILL.md Step 6 中的串行 for 循环，支持并发 + 自动重试。

用法：
  # 二级批量创建
  python scripts/batch_create.py \
    --advertiser-id 108714412 \
    --command "unit create" \
    --payloads "tmp/unit_payload_*.json" \
    --concurrency 5 \
    --output "tmp/unit_results.json"

  # 三级批量创建
  python scripts/batch_create.py \
    --advertiser-id 108714412 \
    --command "creative create-program" \
    --payloads "tmp/creative_payload_*.json" \
    --concurrency 5 \
    --output "tmp/creative_results.json"
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry_utils import is_token_expired

DEFAULT_CONCURRENCY = 5
DEFAULT_MAX_RETRIES = 2
DEFAULT_TIMEOUT = 60
RETRY_DELAY = 3

RETRIABLE_KEYWORDS = ["timeout", "timed out", "connection", "network", "urlopen", "eof"]

# 错误模式 → (error_kind, fix_layer)
# fix_layer 告诉调用方应在哪一层修复，**禁止**绕到不相关层（例如改 unit 主字段去"绕开"素材层错误）
ERROR_PATTERNS = [
    ("auth_token_expired",        "auth",     ["access token过期", "access_token", "token expired", "401001", "402000"]),
    ("material_orientation",      "material", ["横竖版型", "横竖版型不匹配", "orientation"]),
    ("material_size",             "material", ["素材尺寸", "imageSize", "图片尺寸", "视频尺寸"]),
    ("material_invalid",          "material", ["素材审核", "素材不合规", "photo_id"]),
    ("link_invalid",              "link",     ["url 无效", "url不合法", "schema_uri", "u_link", "deeplink"]),
    ("retriable_network",         "retry",    RETRIABLE_KEYWORDS),
    ("param_invalid",             "param",    ["参数错误", "invalid param", "校验失败"]),
]

FIX_LAYER_HINT = {
    "auth":     "鉴权层：脚本已自动重试 1 次；仍未恢复请刷新或重新授权 access_token，不要修改 payload 主字段",
    "material": "素材层：调整 photo_list / 过滤异常素材或重新上传，不要修改 unit/campaign 的版位与渠道字段",
    "link":     "链接层：用 qihang-cli link build 重新生成该商品组的链接，不要复用历史链接",
    "retry":    "重试层：网络/瞬态错误，已自动重试，未恢复请稍后再批量重跑",
    "param":    "参数层：检查模版渲染产物是否被人工修改；不要绕过 render_from_template 直接编辑 payload",
}


def _extract_idx(filename: str) -> int:
    m = re.search(r"_(\d+)\.json$", filename)
    return int(m.group(1)) if m else 0


def _is_retriable(error_text: str) -> bool:
    lower = error_text.lower()
    return any(kw in lower for kw in RETRIABLE_KEYWORDS)


def _should_retry(error_text: str, attempt: int, max_retries: int) -> bool:
    """网络瞬态错误或 token 失效/过期时重试（token 最多重试 1 次）。"""
    if attempt < max_retries and _is_retriable(error_text):
        return True
    if attempt < 1 and is_token_expired(error_text):
        return True
    return False


def _classify_error(error_text: str) -> tuple[str, str]:
    """根据错误文本归类为 (error_kind, fix_layer)；未识别返回 ('unknown', 'inspect')。"""
    if not error_text:
        return "unknown", "inspect"
    lower = error_text.lower()
    for kind, layer, keywords in ERROR_PATTERNS:
        for kw in keywords:
            if kw.lower() in lower:
                return kind, layer
    return "unknown", "inspect"


def _run_one(advertiser_id: str, command_parts: list[str], payload_file: str,
             *, timeout: int, max_retries: int) -> dict:
    cmd = ["kuaishou-cli", "--advertiser-id", advertiser_id, "--output", "json"]
    cmd.extend(command_parts)
    cmd.extend(["-f", payload_file])

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            if result.returncode == 0:
                try:
                    parsed = json.loads(result.stdout)
                    return {"status": "success", "data": parsed}
                except json.JSONDecodeError:
                    return {"status": "success", "data": {"raw": result.stdout.strip()}}

            error_text = result.stderr or result.stdout
            if _should_retry(error_text, attempt, max_retries):
                reason = "token失效/过期" if is_token_expired(error_text) else "retriable error"
                print(
                    f"    [retry {attempt+1}/{max_retries}] {os.path.basename(payload_file)}: "
                    f"{reason}, waiting {RETRY_DELAY}s...",
                    file=sys.stderr,
                )
                time.sleep(RETRY_DELAY)
                continue
            last_error = error_text.strip()[:500]

        except subprocess.TimeoutExpired:
            if attempt < max_retries:
                print(
                    f"    [retry {attempt+1}/{max_retries}] {os.path.basename(payload_file)}: "
                    f"timeout ({timeout}s), waiting {RETRY_DELAY}s...",
                    file=sys.stderr,
                )
                time.sleep(RETRY_DELAY)
                continue
            last_error = f"timeout ({timeout}s) after {max_retries+1} attempts"

        except Exception as e:
            if attempt < max_retries:
                print(
                    f"    [retry {attempt+1}/{max_retries}] {os.path.basename(payload_file)}: "
                    f"{e}, waiting {RETRY_DELAY}s...",
                    file=sys.stderr,
                )
                time.sleep(RETRY_DELAY)
                continue
            last_error = str(e)

    err = last_error or "unknown error"
    kind, layer = _classify_error(err)
    return {
        "status": "failed",
        "error": err,
        "error_kind": kind,
        "fix_layer": layer,
    }


def main():
    parser = argparse.ArgumentParser(
        description="批量并发创建快手广告（二级/三级通用）",
        epilog=(
            "示例:\n"
            '  python scripts/batch_create.py --advertiser-id 108714412 --command "unit create" \\\n'
            '    --payloads "tmp/unit_payload_*.json" --output "tmp/unit_results.json"\n'
            "\n"
            '  python scripts/batch_create.py --advertiser-id 108714412 --command "creative create-program" \\\n'
            '    --payloads "tmp/creative_payload_*.json" --output "tmp/creative_results.json"'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--advertiser-id", required=True, help="广告主账户 ID")
    parser.add_argument("--command", required=True, help='kuaishou-cli 子命令（如 "unit create"）')
    parser.add_argument("--payloads", required=True, help="payload 文件 glob 模式")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help=f"并发数（默认 {DEFAULT_CONCURRENCY}）")
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES, help=f"最大重试次数（默认 {DEFAULT_MAX_RETRIES}）")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT, help=f"单次调用超时秒数（默认 {DEFAULT_TIMEOUT}）")
    parser.add_argument("--output", required=True, help="结果输出文件路径")
    args = parser.parse_args()

    files = sorted(glob.glob(args.payloads), key=_extract_idx)
    if not files:
        print(f"ERROR: 未找到匹配的 payload 文件: {args.payloads}", file=sys.stderr)
        sys.exit(2)

    command_parts = args.command.split()
    total = len(files)
    print(f"开始批量创建: {total} 个任务, 并发={args.concurrency}, 命令=kuaishou-cli {args.command}")

    results = [None] * total
    futures_map = {}

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        for i, fpath in enumerate(files):
            idx = _extract_idx(fpath) or (i + 1)
            future = executor.submit(
                _run_one, args.advertiser_id, command_parts, fpath,
                timeout=args.timeout, max_retries=args.max_retries,
            )
            futures_map[future] = (i, idx, fpath)

        for future in as_completed(futures_map):
            i, idx, fpath = futures_map[future]
            result = future.result()
            result["idx"] = idx
            result["file"] = os.path.basename(fpath)
            results[i] = result
            tag = "OK" if result["status"] == "success" else "FAIL"
            print(f"  [{idx}/{total}] {result['file']}: {tag}")

    success_count = sum(1 for r in results if r and r["status"] == "success")
    fail_count = total - success_count

    failure_breakdown = {}
    for r in results:
        if not r or r.get("status") == "success":
            continue
        kind = r.get("error_kind", "unknown")
        layer = r.get("fix_layer", "inspect")
        bucket = failure_breakdown.setdefault(kind, {"layer": layer, "count": 0, "idx": []})
        bucket["count"] += 1
        bucket["idx"].append(r.get("idx"))

    output = {
        "results": results,
        "summary": {
            "total": total,
            "success": success_count,
            "failed": fail_count,
            "failure_breakdown": failure_breakdown,
        },
    }

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完成! 成功: {success_count}, 失败: {fail_count}, 输出: {args.output}")
    if failure_breakdown:
        print("失败分类（按修复层级）:")
        for kind, info in failure_breakdown.items():
            hint = FIX_LAYER_HINT.get(info["layer"], "")
            idx_list = ",".join(str(i) for i in info["idx"] if i is not None)
            print(f"  - {kind} × {info['count']} (idx={idx_list})  → {hint}")
    sys.exit(0 if fail_count == 0 else 1)


if __name__ == "__main__":
    main()
