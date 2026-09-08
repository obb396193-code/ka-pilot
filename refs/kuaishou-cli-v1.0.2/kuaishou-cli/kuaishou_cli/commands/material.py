"""`kuaishou-cli material` 子命令：素材上传与查询。"""

from __future__ import annotations

import argparse

from .. import constants as c
from ..io_utils import output_result
from ..validators import (
    ensure_advertiser_id,
    validate_image_upload,
    validate_video_share,
    validate_video_upload,
)


def register(subparsers):
    parser = subparsers.add_parser(
        "material",
        help="图片/视频素材上传与查询",
        description="素材上传、共享、标签查询。",
    )
    sub = parser.add_subparsers(dest="material_action", required=True, title="动作", metavar="<action>")

    img = sub.add_parser(
        "image-upload",
        help="上传图片素材",
        description="上传图片，返回 image_token。",
        epilog="示例:\n  kuaishou-cli material image-upload --file ./cover.jpg --type 5",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    img.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    img.add_argument("--url", help="公网图片 URL")
    img.add_argument("--file", help="本地图片路径")
    img.add_argument("--type", type=int, help="图片类型")
    img.add_argument("--dry-run", action="store_true", help="只打印请求体")
    img.set_defaults(func=handle_image_upload)

    vid = sub.add_parser(
        "video-upload",
        help="上传视频素材",
        description="上传视频，返回 photo_id。",
        epilog="示例:\n  kuaishou-cli material video-upload --url https://example.com/v.mp4 --type 1",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    vid.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    vid.add_argument("--url", help="公网视频 URL")
    vid.add_argument("--file", help="本地视频路径")
    vid.add_argument("--type", type=int, required=True, help="视频类型")
    vid.add_argument("--photo-name", help="自定义素材名（最长 49 字符）")
    vid.add_argument("--dry-run", action="store_true", help="只打印请求体")
    vid.set_defaults(func=handle_video_upload)

    share = sub.add_parser(
        "video-share",
        help="共享视频素材到其他账户",
        description="把视频共享给目标账户。",
        epilog="示例:\n  kuaishou-cli material video-share --account-ids 108714412 --photo-ids 5200813326191466747",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    share.add_argument("--advertiser-id", help="源素材所属广告主 ID")
    share.add_argument("--account-ids", nargs="+", required=True, help="目标广告主 ID，支持空格或逗号分隔")
    share.add_argument("--photo-ids", nargs="+", required=True, help="源 photo_id，支持空格或逗号分隔")
    share.add_argument("--dry-run", action="store_true", help="只打印请求体")
    share.set_defaults(func=handle_video_share)

    tags = sub.add_parser(
        "video-tags",
        help="按 photo_id 拉回视频素材标签",
        description="查询视频重复度/质量标签摘要。",
        epilog="示例:\n  kuaishou-cli material video-tags --photo-ids 5200531866836206830",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    tags.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    tags.add_argument("--photo-ids", nargs="+", required=True, help="视频 photo_id，支持空格或逗号分隔")
    tags.add_argument("--full", action="store_true", help="返回接口原始响应")
    tags.add_argument("--dry-run", action="store_true", help="只打印请求体")
    tags.set_defaults(func=handle_video_tags)

    list_p = sub.add_parser(
        "list",
        help="查询账户素材库",
        description="分页查询 image 或 video 素材。",
    )
    list_p.add_argument("--advertiser-id", help="覆盖默认 advertiser_id")
    list_p.add_argument("--kind", choices=["image", "video"], required=True, help="素材类型")
    list_p.add_argument("--page", type=int, default=1, help="页码")
    list_p.add_argument("--page-size", type=int, default=c.DEFAULT_PAGE_SIZE, help="每页条数")
    list_p.add_argument("--dry-run", action="store_true", help="只打印请求体")
    list_p.set_defaults(func=handle_list)


def upload_image(client, advertiser_id, *, url=None, file=None, image_type=None, dry_run=False):
    payload = {"advertiser_id": advertiser_id, "upload_type": 2}
    if url:
        payload["url"] = url
    if file:
        payload["file"] = file
    if image_type:
        payload["type"] = image_type
    payload = validate_image_upload(payload)
    return client.upload_image(payload, dry_run=dry_run)


def upload_video(client, advertiser_id, *, url=None, file=None, video_type, photo_name=None, dry_run=False):
    payload = {"advertiser_id": advertiser_id, "type": video_type}
    if url:
        payload["url"] = url
    if file:
        payload["file"] = file
    if photo_name:
        payload["photo_name"] = photo_name[:49]
    payload = validate_video_upload(payload)
    return client.upload_video(payload, dry_run=dry_run)


def handle_image_upload(args, client):
    advertiser_id = ensure_advertiser_id(args)
    result = upload_image(client, advertiser_id, url=args.url, file=args.file, image_type=args.type, dry_run=args.dry_run)
    output_result(result, args.output)


def handle_video_upload(args, client):
    advertiser_id = ensure_advertiser_id(args)
    result = upload_video(
        client,
        advertiser_id,
        url=args.url,
        file=args.file,
        video_type=args.type,
        photo_name=args.photo_name,
        dry_run=args.dry_run,
    )
    output_result(result, args.output)


def handle_video_share(args, client):
    payload = validate_video_share(
        {
            "advertiser_id": ensure_advertiser_id(args),
            "account_ids": _split_values(args.account_ids),
            "photo_ids": _split_values(args.photo_ids),
        }
    )
    output_result(client.request_json(c.VIDEO_SHARE_NEW, payload, dry_run=args.dry_run), args.output)


def handle_video_tags(args, client):
    payload = {"advertiser_id": ensure_advertiser_id(args), "photo_ids": _split_values(args.photo_ids)}
    result = client.request_json(c.VIDEO_GET, payload, dry_run=args.dry_run)
    if args.dry_run or args.full:
        output_result(result, args.output)
        return
    output_result(summarize_video_tags(result), args.output)


def handle_list(args, client):
    payload = {"advertiser_id": ensure_advertiser_id(args), "page": args.page, "page_size": args.page_size}
    method = c.IMAGE_LIST if args.kind == "image" else c.VIDEO_LIST
    output_result(client.request_json(method, payload, dry_run=args.dry_run), args.output)


def summarize_video_tags(result):
    rows = result.get("data") if isinstance(result, dict) else result
    if isinstance(rows, dict):
        rows = rows.get("details") or rows.get("list") or rows.get("data")
    if not isinstance(rows, list):
        return result
    summaries = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        valuation = row.get("photo_valuate_info") or row.get("adPhotoValuateInfo") or {}
        summaries.append(
            {
                "photo_id": row.get("photo_id"),
                "photo_name": row.get("photo_name"),
                "photo_dup_status": row.get("photo_dup_status"),
                "photo_tag": row.get("photo_tag"),
                "photo_tag_identify_items": pick(row, "photo_tag_identify_items", "photoTagIdentifyItems"),
                "sim_label": pick(valuation, "sim_label", "simLabel"),
                "is_dup_photo": pick(valuation, "is_dup_photo", "isDupPhoto"),
                "quality_label": pick(valuation, "quality_label", "qualityLabel"),
                "running_score": pick(valuation, "running_score", "runningScore"),
                "hit_tag_combination": pick(valuation, "hit_tag_combination", "hitTagCombination"),
            }
        )
    return {"code": result.get("code"), "message": result.get("message"), "data": summaries}


def pick(data, *keys):
    for key in keys:
        if key in data:
            return data[key]
    return None


def _split_values(values):
    result = []
    for value in values:
        result.extend(part.strip() for part in str(value).split(",") if part.strip())
    return result
