"""`qihang-cli link` 子命令：启航链接生成。"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

from .. import constants as c
from ..client import QihangApiError
from ..io_utils import CliError, eprint, print_json, print_request_dryrun

HTTP_MAX_RETRIES = 3
HTTP_RETRY_BASE_DELAY = 2
BATCH_INTERVAL = 2


def register(subparsers, common):
    parser = subparsers.add_parser(
        "link",
        help="启航链接生成",
        description="调用启航 generate_build_links 接口批量生成广告链接。",
    )
    sub = parser.add_subparsers(dest="link_action", required=True, title="动作", metavar="<action>")

    build = sub.add_parser(
        "build",
        parents=[common],
        help="批量生成广告链接（按商品组）",
        description=(
            "读取 material_groups.json，逐商品调用启航 generate_build_links 接口，\n"
            "输出 links.json（按 item_id 的链接映射表）。\n"
            "走 qh.alibaba-inc.com（受 --base-url 影响）。"
            "带 --output-file 时写完整 JSON 到文件，stdout 摘要为 "
            "{savedTo,total,success,failed}（无 preview）。"
        ),
        epilog=(
            "示例:\n"
            "  qihang-cli link build --media KUAISHOU \\\n"
            "      --advertiser-id 108714412 --task-id 1803240580 \\\n"
            "      --page-id landing_v2_1314 --input tmp/material_groups.json \\\n"
            "      --output-file tmp/links.json\n"
            "\n"
            "  # 激活类需追加监测后缀\n"
            "  qihang-cli link build --media KUAISHOU \\\n"
            "      --advertiser-id 108714412 --task-id 1803240580 \\\n"
            "      --page-id landing_v2_1314 --input tmp/material_groups.json \\\n"
            "      --output-file tmp/links.json \\\n"
            '      --track-suffix "&translationTag2=104_60&translationTag=86_60"'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    build.add_argument("--advertiser-id", required=True, dest="advertiser_id", help="广告主账户 ID")
    build.add_argument("--task-id", required=True, dest="task_id", help="任务 ID")
    build.add_argument(
        "--page-id",
        required=True,
        dest="page_id",
        help="承接页 ID（KUAISHOU 媒体必须为 landing_v2_<数字> 完整字符串，如 landing_v2_1314）",
    )
    build.add_argument("--input", required=True, dest="input_file", help="输入文件路径（material_groups.json）")
    build.add_argument("--media", required=True, help="媒体（必填，如 KUAISHOU / TENCENT / TOUTIAO 等）")
    build.add_argument(
        "--delivery-target",
        default="",
        dest="delivery_target",
        help=(
            "投放目标（快手必填，其他媒体可不传）。"
            "可选值: 180=激活, 190=付费, 394=下单, 324=应用唤起, 53=表单数"
        ),
    )
    build.add_argument(
        "--track-suffix",
        default="",
        dest="track_suffix",
        help="追加到 clickUrl/exposureUrl 末尾的监测后缀（传了即追加；幂等，已含 translationTag 则跳过）",
    )
    build.add_argument("--dry-run", action="store_true", help="只构造请求 URL，不实际发请求")
    build.set_defaults(func=handle_build)


def _unwrap_response(parsed: dict) -> dict:
    """解析启航响应，校验 successful/code，返回 data dict。"""
    successful = parsed.get("successful")
    code = parsed.get("code")
    if successful is False:
        msg = parsed.get("message") or parsed.get("msg") or ""
        if not msg:
            msg = f"服务端未返回错误信息，完整响应: {json.dumps(parsed, ensure_ascii=False, default=str)}"
        raise QihangApiError(f"接口业务失败 successful=false code={code!r} message={msg}")
    if successful is None and code not in (None, 0, "", "0"):
        msg = parsed.get("message") or parsed.get("msg") or ""
        if not msg:
            msg = f"服务端未返回错误信息，完整响应: {json.dumps(parsed, ensure_ascii=False, default=str)}"
        raise QihangApiError(f"接口业务失败 code={code!r} message={msg}")
    data = parsed.get("data")
    return data if isinstance(data, dict) else parsed


def _call_with_retry(client, path: str, params: dict[str, str]) -> dict:
    """GET 调启航接口，带指数退避重试。"""
    last_err: Exception | None = None
    for attempt in range(HTTP_MAX_RETRIES + 1):
        try:
            raw = client.request_get(path, params)
            return _unwrap_response(raw)
        except QihangApiError:
            raise
        except Exception as e:
            last_err = e
            if attempt < HTTP_MAX_RETRIES:
                delay = HTTP_RETRY_BASE_DELAY * (2 ** attempt)
                eprint(
                    f"    [HTTP retry {attempt+1}/{HTTP_MAX_RETRIES}] "
                    f"{type(e).__name__}: {e}; 等待 {delay}s 后重试"
                )
                time.sleep(delay)
                continue
    raise QihangApiError(f"启航接口最终失败 ({HTTP_MAX_RETRIES+1} 次): {last_err}")


def _append_track_suffix(url: str, suffix: str) -> str:
    """追加监测后缀，幂等（已含 translationTag 则跳过）。"""
    if not url or not suffix or "?" not in url:
        return url
    if "translationTag" in url:
        return url
    suf = suffix.lstrip("&")
    if not suf:
        return url
    base = url.rstrip("&")
    return f"{base}&{suf}"


def _extract_urls(data: dict, track_suffix: str = "") -> dict[str, str]:
    """从 generate_build_links 响应提取 5 个链接字段。"""
    inner = data
    if isinstance(data.get("data"), dict):
        inner = data["data"]

    h5_url = inner.get("h5Url") or inner.get("h5_url") or ""
    click_url = inner.get("clickLinkUrl") or inner.get("click_link_url") or ""
    exposure_url = inner.get("exposureLinkUrl") or inner.get("exposure_link_url") or ""
    schema_uri = inner.get("deepLink") or inner.get("deep_link") or ""
    u_link = inner.get("universalLink") or inner.get("universal_link") or ""

    if track_suffix:
        click_url = _append_track_suffix(click_url, track_suffix)
        exposure_url = _append_track_suffix(exposure_url, track_suffix)

    return {
        "url": h5_url,
        "clickUrl": click_url,
        "exposureUrl": exposure_url,
        "schemaUri": schema_uri,
        "uLink": u_link,
    }


_KUAISHOU_PAGE_ID_PATTERN = re.compile(r"landing_v2_\d+")


def handle_build(args, client):
    # 入参格式校验：KUAISHOU 媒体下 --page-id 必须是 landing_v2_<数字> 完整字符串。
    # 历史教训：调用方（含 LLM）常用正则 r'landing_v2_(\d+)' 只取捕获组数字，
    # 把 "landing_v2_1314" 抠成 "1314"。后端字面拼承接 id = product_<task_id><page_id>_1，
    # 拼出意外串接（product_18032405801314_1），返回误导性的"分流器配置已过期"。
    # 在本地拦截可以把这个坑封死，并把错误信息直接指回正确格式。
    if args.media == "KUAISHOU" and not _KUAISHOU_PAGE_ID_PATTERN.fullmatch(args.page_id):
        raise CliError(
            f"--page-id 格式错误: 收到 '{args.page_id}'，"
            f"KUAISHOU 媒体下必须是 'landing_v2_<数字>' 完整字符串（如 landing_v2_1314）。\n"
            f"常见误区：从任务信息 page 字段（如 'landing_v2_1314（13129承接页...）'）提取时，"
            f"应使用正则 r'landing_v2_\\d+' 取整段，"
            f"不要用 r'landing_v2_(\\d+)' 只取捕获组的数字部分。"
        )

    # KUAISHOU 媒体下 deliveryTarget 服务端必填，本地拦截避免提交后才报错。
    # 候选值: 180=激活, 190=付费, 394=下单, 324=应用唤起, 53=表单数
    if args.media == "KUAISHOU" and not args.delivery_target:
        raise CliError(
            "--delivery-target 在 KUAISHOU 媒体下必填。"
            "候选值：180=激活, 190=付费, 394=下单, 324=应用唤起, 53=表单数。\n"
            "对应快手广告组的 ocpx_action_type；可在 kuaishou-cli unit list 返回里查到。"
        )

    input_path = Path(args.input_file)
    if not input_path.exists():
        raise CliError(f"输入文件不存在: {input_path}")

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    groups = data.get("groups", [])
    if not groups:
        raise CliError("输入文件中无商品组数据")

    eprint(f"开始为 {len(groups)} 个商品组生成链接（dry_run={args.dry_run}）...")

    links: dict[str, Any] = {}
    success_count = 0
    fail_count = 0

    for i, group in enumerate(groups):
        raw_item_id = group.get("item_id")
        item_id = str(raw_item_id) if raw_item_id else "0"
        link_key = item_id if item_id != "0" else f"no_item_{i}"
        params = {
            "taskId": str(args.task_id),
            "adSpaceId": str(args.advertiser_id),
            "pageId": str(args.page_id),
            "itemId": item_id,
            "media": args.media,
        }
        if args.delivery_target:
            params["deliveryTarget"] = args.delivery_target
        if args.track_suffix:
            params["trackUrlSuffix"] = args.track_suffix

        label = f"商品 {item_id}" if item_id != "0" else "无商品(通投)"
        eprint(f"  [{i+1}/{len(groups)}] {label}: build...")

        if args.dry_run:
            url = client.url_for(c.LINK_GENERATE_BUILD_LINKS)
            links[link_key] = {"_dry_run": True, "url": url, "params": params}
            success_count += 1
        else:
            try:
                raw_result = _call_with_retry(client, c.LINK_GENERATE_BUILD_LINKS, params)
                urls = _extract_urls(raw_result)
                missing = [k for k in ("url", "exposureUrl", "clickUrl") if not urls.get(k)]
                if missing:
                    fail_count += 1
                    links[link_key] = {**urls, "error": f"缺失必填字段: {missing}", "raw_build": raw_result}
                    eprint(f"  [{label}] 缺失必填字段 {missing}")
                else:
                    links[link_key] = urls
                    success_count += 1
            except Exception as e:
                fail_count += 1
                links[link_key] = {"error": str(e)}
                eprint(f"  [{label}] FAIL: {e}")

        if i < len(groups) - 1:
            time.sleep(BATCH_INTERVAL)

    output = {
        "links": links,
        "summary": {
            "total": len(groups),
            "success": success_count,
            "failed": fail_count,
            "dry_run": args.dry_run,
        },
    }

    output_file = getattr(args, "output_file", None)
    if output_file:
        target = Path(output_file).expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(output, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        summary = {
            "savedTo": str(target),
            "total": len(groups),
            "success": success_count,
            "failed": fail_count,
        }
        print_json(summary)
    else:
        print_json(output)

    eprint(f"\n完成! 成功: {success_count}, 失败: {fail_count}")
    if fail_count > 0:
        raise SystemExit(1)
