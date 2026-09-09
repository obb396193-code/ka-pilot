"""`kuaishou-cli creative` 子命令：自定义/程序化创意。"""

from __future__ import annotations

import argparse
from typing import Any

from .. import constants as c
from ..io_utils import output_result, read_json_file
from ..validators import (
    ensure_advertiser_id,
    merge_advertiser_id,
    validate_custom_creative_create,
    validate_program_creative_create,
)
from .material import upload_image, upload_video


def register(subparsers):
    parser = subparsers.add_parser(
        "creative",
        help="创意（三级）查询与创建",
        description="自定义/程序化创意查询与创建，支持 JSON 内嵌 upload_video/upload_image 自动上传回填。",
    )
    sub = parser.add_subparsers(dest="creative_action", required=True, title="动作", metavar="<action>")

    list_p = sub.add_parser("list", help="查询广告组下的自定义创意", description="按 unit_id 分页查询自定义创意。")
    list_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    list_p.add_argument("--unit-id", required=True, help="广告组 unit_id")
    list_p.add_argument("--page", type=int, default=1, help="页码")
    list_p.add_argument("--page-size", type=int, default=c.DEFAULT_PAGE_SIZE, help="每页条数")
    list_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    list_p.set_defaults(func=handle_list)

    get_p = sub.add_parser("get", help="按 creative_id 查询单个自定义创意", description="查询指定创意。")
    get_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    get_p.add_argument("--unit-id", required=True, help="广告组 unit_id")
    get_p.add_argument("--creative-id", required=True, help="creative_id")
    get_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    get_p.set_defaults(func=handle_get)

    program_list = sub.add_parser(
        "program-list",
        help="查询广告组下的程序化创意",
        description="按 unit_id 分页查询程序化创意。",
    )
    program_list.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    program_list.add_argument("--unit-id", required=True, help="广告组 unit_id")
    program_list.add_argument("--page", type=int, default=1, help="页码")
    program_list.add_argument("--page-size", type=int, default=500, help="每页条数")
    program_list.add_argument("--dry-run", action="store_true", help="只打印请求体")
    program_list.set_defaults(func=handle_program_list)

    custom = sub.add_parser(
        "create-custom",
        help="创建自定义创意（payload 来自 JSON 文件）",
        description="从 JSON 文件创建自定义创意。",
        epilog="示例:\n  kuaishou-cli creative create-custom -f creative_custom.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    custom.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    custom.add_argument("--unit-id", help="覆盖 JSON 中的 unit_id")
    custom.add_argument("--input", "-f", required=True, help="自定义创意 payload JSON 路径")
    custom.add_argument("--dry-run", action="store_true", help="只打印请求体")
    custom.set_defaults(func=handle_create_custom)

    program = sub.add_parser(
        "create-program",
        help="创建程序化创意（payload 来自 JSON 文件）",
        description="从 JSON 文件创建程序化创意。",
        epilog="示例:\n  kuaishou-cli creative create-program -f creative_program.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    program.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    program.add_argument("--unit-id", help="覆盖 JSON 中的 unit_id")
    program.add_argument("--input", "-f", required=True, help="程序化创意 payload JSON 路径")
    program.add_argument("--dry-run", action="store_true", help="只打印请求体")
    program.set_defaults(func=handle_create_program)


def handle_list(args, client):
    payload = {
        "advertiser_id": ensure_advertiser_id(args),
        "unit_id": args.unit_id,
        "page": args.page,
        "page_size": args.page_size,
    }
    output_result(client.request_json(c.CREATIVE_LIST, payload, dry_run=args.dry_run), args.output)


def handle_get(args, client):
    payload = {
        "advertiser_id": ensure_advertiser_id(args),
        "unit_id": args.unit_id,
        "creative_id": args.creative_id,
        "page": 1,
        "page_size": 1,
    }
    output_result(client.request_json(c.CREATIVE_LIST, payload, dry_run=args.dry_run), args.output)


def handle_program_list(args, client):
    payload = {
        "advertiser_id": ensure_advertiser_id(args),
        "unit_ids": [int(args.unit_id)],
        "page": args.page,
        "page_size": args.page_size,
    }
    output_result(client.request_json(c.PROGRAM_CREATIVE_LIST, payload, dry_run=args.dry_run), args.output)


def handle_create_custom(args, client):
    payload = merge_advertiser_id(args, read_json_file(args.input))
    if args.unit_id:
        payload.setdefault("unit_id", args.unit_id)
    payload = upload_embedded_materials(client, payload, args.dry_run, mode="custom")
    payload = validate_custom_creative_create(payload)
    output_result(client.request_json(c.CREATIVE_CREATE, payload, dry_run=args.dry_run), args.output)


def handle_create_program(args, client):
    payload = merge_advertiser_id(args, read_json_file(args.input))
    if args.unit_id:
        payload.setdefault("unit_id", args.unit_id)
    payload = upload_embedded_materials(client, payload, args.dry_run, mode="program")
    payload = validate_program_creative_create(payload)
    output_result(client.request_json(c.PROGRAM_CREATIVE_CREATE, payload, dry_run=args.dry_run), args.output)


def upload_embedded_materials(client, payload: dict[str, Any], dry_run: bool, *, mode: str) -> dict[str, Any]:
    data = dict(payload)
    advertiser_id = str(data.get("advertiser_id"))

    one_video = data.pop("upload_video", None)
    if one_video:
        video_resp = _upload_video_descriptor(client, advertiser_id, one_video, dry_run)
        photo_id = _extract(video_resp, "photo_id", "data.photo_id") or f"<photo_id-from-{one_video.get('file') or one_video.get('url')}>"
        data.setdefault("photo_id", photo_id)

    one_image = data.pop("upload_image", None)
    if one_image:
        image_resp = _upload_image_descriptor(client, advertiser_id, one_image, dry_run)
        image_token = _extract(image_resp, "image_token", "data.image_token") or f"<image_token-from-{one_image.get('file') or one_image.get('url')}>"
        if mode == "custom":
            if "image_token" not in data and "image_tokens" not in data:
                data["image_token"] = image_token
        else:
            data.setdefault("cover_image_tokens", [image_token])

    upload_videos = data.pop("upload_videos", None) or []
    if upload_videos:
        photo_list = data.setdefault("photo_list", [])
        for item in upload_videos:
            video_resp = _upload_video_descriptor(client, advertiser_id, item, dry_run)
            photo_id = _extract(video_resp, "photo_id", "data.photo_id") or f"<photo_id-from-{item.get('file') or item.get('url')}>"
            material_type = str(item.get("creative_material_type") or item.get("type") or 1)
            photo_list.append({"photo_id": photo_id, "creative_material_type": material_type})

    upload_images = data.pop("upload_images", None) or []
    if upload_images:
        tokens = list(data.get("image_tokens") or data.get("pic_list") or [])
        for item in upload_images:
            image_resp = _upload_image_descriptor(client, advertiser_id, item, dry_run)
            image_token = _extract(image_resp, "image_token", "data.image_token") or f"<image_token-from-{item.get('file') or item.get('url')}>"
            tokens.append(image_token)
        if mode == "custom":
            data.setdefault("image_tokens", tokens)
        else:
            data.setdefault("pic_list", tokens)

    return data


def _upload_image_descriptor(client, advertiser_id: str, item: dict[str, Any], dry_run: bool):
    return upload_image(
        client,
        advertiser_id,
        url=item.get("url"),
        file=item.get("file"),
        image_type=item.get("type"),
        dry_run=dry_run,
    )


def _upload_video_descriptor(client, advertiser_id: str, item: dict[str, Any], dry_run: bool):
    return upload_video(
        client,
        advertiser_id,
        url=item.get("url"),
        file=item.get("file"),
        video_type=int(item.get("type") or item.get("creative_material_type") or 1),
        photo_name=item.get("photo_name"),
        dry_run=dry_run,
    )


def _extract(obj: dict[str, Any], *paths: str):
    for path in paths:
        cur: Any = obj
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                cur = None
                break
        if cur is not None:
            return cur
    return None
