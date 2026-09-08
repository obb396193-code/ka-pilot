"""Minimal validators for Kuaishou CLI payloads."""

from __future__ import annotations

from typing import Any


class ValidationError(RuntimeError):
    pass


def ensure_advertiser_id(args: Any, payload: dict[str, Any] | None = None) -> str:
    advertiser_id = getattr(args, "advertiser_id", None) or (payload or {}).get("advertiser_id")
    if not advertiser_id:
        raise ValidationError("缺少 advertiser_id。请通过 --advertiser-id 传入。")
    return str(advertiser_id)


def merge_advertiser_id(args: Any, payload: dict[str, Any]) -> dict[str, Any]:
    merged = dict(payload)
    merged.setdefault("advertiser_id", ensure_advertiser_id(args, payload))
    return merged


def validate_campaign_create(payload: dict[str, Any]) -> dict[str, Any]:
    return dict(payload)


BID_MAX_YUAN = 150
_BID_FIELDS = ("bid", "cpa_bid", "ocpc_bid", "deep_conversion_bid")


def validate_bid_yuan(value: float, field: str = "bid") -> None:
    if value <= 0:
        raise ValidationError(f"{field} 必须为正数，当前 {value}")
    if value > BID_MAX_YUAN:
        raise ValidationError(f"{field} 不能超过 {BID_MAX_YUAN} 元，当前 {value}")


def validate_unit_create(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    for field in _BID_FIELDS:
        if field in data and data[field] is not None:
            try:
                val = float(data[field])
            except (TypeError, ValueError):
                raise ValidationError(f"{field} 必须是数值，当前 {data[field]!r}")
            bid_li_max = int(BID_MAX_YUAN * 1000)
            if val <= 0:
                raise ValidationError(f"{field} 必须为正数，当前 {val}")
            if val > bid_li_max:
                raise ValidationError(
                    f"{field} 不能超过 {bid_li_max}（即 {BID_MAX_YUAN} 元），当前 {val}"
                )
    return data


def validate_custom_creative_create(payload: dict[str, Any]) -> dict[str, Any]:
    return dict(payload)


def validate_program_creative_create(payload: dict[str, Any]) -> dict[str, Any]:
    return dict(payload)


def validate_image_upload(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if not data.get("url") and not data.get("file"):
        raise ValidationError("图片上传需要 url 或 file。")
    return data


def validate_video_upload(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if not data.get("file") and not data.get("url"):
        raise ValidationError("视频上传需要 file 或 url。")
    if not data.get("type"):
        raise ValidationError("视频上传需要 type。")
    return data


_SCHEDULE_LEN = 168  # 7 天 * 24 小时
_DAY_INDEX = {
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}
_PRESETS = {
    "all_day": "1" * _SCHEDULE_LEN,
    "workday_9_22": (("0" * 9 + "1" * 13 + "0" * 2) * 5) + ("0" * 24 * 2),
    "workday_full": ("1" * 24 * 5) + ("0" * 24 * 2),
    "weekend_only": ("0" * 24 * 5) + ("1" * 24 * 2),
    "evening_18_24": ("0" * 18 + "1" * 6) * 7,
}


def _parse_days(days: str) -> list[int]:
    result: list[int] = []
    for raw in days.split(","):
        key = raw.strip().lower()
        if not key:
            continue
        if key not in _DAY_INDEX:
            raise ValidationError(
                f"--days 无效取值 {raw!r}，仅支持: {','.join(_DAY_INDEX.keys())}"
            )
        idx = _DAY_INDEX[key]
        if idx not in result:
            result.append(idx)
    if not result:
        raise ValidationError("--days 不能为空")
    return result


def build_schedule_time(
    *,
    raw: str | None,
    preset: str | None,
    days: str | None,
    from_h: int | None,
    to_h: int | None,
) -> str:
    """根据三种入口之一组装 168 位投放时段串。

    优先级：raw > preset > days+from+to。
    第 1 位 = 周一 00:00-01:00，第 168 位 = 周日 23:00-24:00。
    """
    provided = sum(1 for x in (raw, preset, days) if x)
    if provided == 0:
        raise ValidationError(
            "需指定 --schedule-time / --preset / --days 三种入口之一"
        )
    if provided > 1:
        raise ValidationError(
            "--schedule-time / --preset / --days 三者互斥，只能选一种"
        )

    if raw is not None:
        if len(raw) != _SCHEDULE_LEN:
            raise ValidationError(f"--schedule-time 长度必须为 {_SCHEDULE_LEN}，当前 {len(raw)}")
        if any(ch not in "01" for ch in raw):
            raise ValidationError("--schedule-time 只能包含 0 和 1")
        return raw

    if preset is not None:
        if preset not in _PRESETS:
            raise ValidationError(
                f"--preset 无效取值 {preset!r}，仅支持: {','.join(_PRESETS.keys())}"
            )
        return _PRESETS[preset]

    if from_h is None or to_h is None:
        raise ValidationError("--days 模式下 --from 和 --to 必填")
    if not (0 <= from_h <= 23):
        raise ValidationError(f"--from 取值范围 0-23，当前 {from_h}")
    if not (1 <= to_h <= 24):
        raise ValidationError(f"--to 取值范围 1-24，当前 {to_h}")
    if from_h >= to_h:
        raise ValidationError(f"--from ({from_h}) 必须小于 --to ({to_h})")
    day_indices = _parse_days(days or "")
    slots = ["0"] * _SCHEDULE_LEN
    for d in day_indices:
        base = d * 24
        for h in range(from_h, to_h):
            slots[base + h] = "1"
    return "".join(slots)


def schedule_presets() -> list[str]:
    return list(_PRESETS.keys())


def validate_video_share(payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    account_ids = data.get("account_ids")
    photo_ids = data.get("photo_ids")
    if not isinstance(account_ids, list) or not account_ids:
        raise ValidationError("视频素材共享需要 account_ids，目标账号至少 1 个。")
    if not isinstance(photo_ids, list) or not photo_ids:
        raise ValidationError("视频素材共享需要 photo_ids，源素材至少 1 个。")
    if len(photo_ids) > 10:
        raise ValidationError("视频素材共享单次 photo_ids 不能超过 10 个。")
    if len(set(str(pid) for pid in photo_ids)) != len(photo_ids):
        raise ValidationError("视频素材共享的 photo_ids 不能重复。")
    return data
