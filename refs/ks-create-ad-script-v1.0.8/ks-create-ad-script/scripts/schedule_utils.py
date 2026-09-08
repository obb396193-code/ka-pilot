#!/usr/bin/env python3
"""
投放时段解析工具。

将人类可读的投放时段描述转换为快手 API 的 168 位 0/1 字符串。
168 位 = 7 天 × 24 小时，第 1 位 = 周一 00:00-01:00，第 168 位 = 周日 23:00-24:00。
1 = 投放，0 = 不投放。

支持格式：
  - 预设：全天 / 每天 / 工作日 / 周末
  - 自然语言：周一到周五, 11点-23点
  - 自然语言：周一至周日, 9-22
  - 原始 168 位 0/1 串

与 kuaishou-cli validators.build_schedule_time 的位序完全一致。
"""
from __future__ import annotations

import re

SCHEDULE_LEN = 168  # 7 天 * 24 小时

# 星期中文 → 索引（周一=0 … 周日=6，与 kuaishou-cli 一致）
_DAY_MAP: dict[str, int] = {
    "周一": 0, "周二": 1, "周三": 2, "周四": 3, "周五": 4,
    "周六": 5, "周日": 6, "周天": 6,
    "星期一": 0, "星期二": 1, "星期三": 2, "星期四": 3,
    "星期五": 4, "星期六": 5, "星期日": 6, "星期天": 6,
}

_DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

# 预设投放时段
_PRESETS: dict[str, str] = {
    "全天": "1" * SCHEDULE_LEN,
    "每天": "1" * SCHEDULE_LEN,
    "工作日": ("1" * 24 * 5) + ("0" * 24 * 2),
    "周末": ("0" * 24 * 5) + ("1" * 24 * 2),
}


def parse_schedule_time(value) -> str:
    """解析投放时段描述为 168 位 0/1 字符串。

    Args:
        value: 字符串，支持预设、自然语言、原始 168 位串

    Returns:
        168 位 0/1 字符串

    Raises:
        ValueError: 格式无法解析
    """
    if not value or not isinstance(value, str):
        raise ValueError("投放时段不能为空")

    text = value.strip()

    # 原始 168 位 0/1 串
    if len(text) == SCHEDULE_LEN and all(c in "01" for c in text):
        return text

    # 预设
    if text in _PRESETS:
        return _PRESETS[text]

    # 自然语言：周期 + 时段
    return _parse_natural_language(text)


def _parse_natural_language(text: str) -> str:
    """解析自然语言格式 '周期, 时段'。"""
    parts = re.split(r"[,，\s]+", text.strip())
    parts = [p for p in parts if p]
    if len(parts) < 2:
        raise ValueError(
            f"投放时段格式无效: {text!r}，"
            f"应为 '周期, 时段' 如 '周一到周五, 11点-23点'"
        )

    days_str = parts[0]
    hours_str = parts[1]

    day_indices = _parse_days(days_str)
    from_h, to_h = _parse_hours(hours_str)

    slots = ["0"] * SCHEDULE_LEN
    for d in day_indices:
        base = d * 24
        for h in range(from_h, to_h):
            slots[base + h] = "1"
    return "".join(slots)


def _parse_days(days_str: str) -> list[int]:
    """解析周期描述为日期索引列表。"""
    days_str = days_str.strip()

    # 预设关键词 → 全周
    if days_str in ("每天", "全天"):
        return list(range(7))

    # 单个日期
    if days_str in _DAY_MAP:
        return [_DAY_MAP[days_str]]

    # 范围：周一到周五 / 周一至周日
    range_match = re.match(r"^(.+?)[到至](.+)$", days_str)
    if range_match:
        start = _DAY_MAP.get(range_match.group(1).strip())
        end = _DAY_MAP.get(range_match.group(2).strip())
        if start is not None and end is not None:
            if start <= end:
                return list(range(start, end + 1))
            else:
                # 跨周，如周六到周一
                return list(range(start, 7)) + list(range(0, end + 1))

    # 逗号分隔：周一,周三,周五
    if "," in days_str or "，" in days_str:
        indices: list[int] = []
        for part in re.split(r"[,，]", days_str):
            part = part.strip()
            if part in _DAY_MAP:
                indices.append(_DAY_MAP[part])
        if indices:
            return indices

    raise ValueError(f"无法解析周期: {days_str!r}")


def _parse_hours(hours_str: str) -> tuple[int, int]:
    """解析时段描述为 (from_h, to_h)。

    to_h 为排他上界（与 kuaishou-cli 一致）：
    '11-23' → from_h=11, to_h=23 → 投放 11:00-23:00
    """
    hours_str = hours_str.strip()
    # 移除"点"/"時"字
    hours_str = hours_str.replace("点", "").replace("時", "").replace("时", "")

    range_match = re.match(r"^(\d{1,2})[-~～](\d{1,2})$", hours_str)
    if range_match:
        from_h = int(range_match.group(1))
        to_h = int(range_match.group(2))
        _validate_hours(from_h, to_h)
        return from_h, to_h

    raise ValueError(
        f"无法解析时段: {hours_str!r}，应为 '11-23' 或 '11点-23点' 格式"
    )


def _validate_hours(from_h: int, to_h: int) -> None:
    if not (0 <= from_h <= 23):
        raise ValueError(f"起始小时取值范围 0-23，当前 {from_h}")
    if not (1 <= to_h <= 24):
        raise ValueError(f"结束小时取值范围 1-24，当前 {to_h}")
    if from_h >= to_h:
        raise ValueError(f"起始小时 ({from_h}) 必须小于结束小时 ({to_h})")


def schedule_time_label(value) -> str:
    """生成投放时段的可读标签，用于预览展示。"""
    if not value:
        return "未指定（按账户默认全天投放）"

    try:
        bits = parse_schedule_time(value)
    except ValueError:
        return f"自定义 ({value})"

    if bits == "1" * SCHEDULE_LEN:
        return "全天投放"
    if bits == ("1" * 24 * 5) + ("0" * 24 * 2):
        return "工作日全天"
    if bits == ("0" * 24 * 5) + ("1" * 24 * 2):
        return "周末全天"

    # 解析具体时段
    days_label, hours_label = _bits_to_label(bits)
    if hours_label:
        return f"{days_label} {hours_label}"
    return days_label


def _bits_to_label(bits: str) -> tuple[str, str]:
    """将 168 位串转换为可读标签。"""
    active_days: list[int] = []
    day_hours: dict[int, list[int]] = {}
    for d in range(7):
        day_bits = bits[d * 24 : (d + 1) * 24]
        active_hours = [h for h in range(24) if day_bits[h] == "1"]
        if active_hours:
            active_days.append(d)
            day_hours[d] = active_hours

    if not active_days:
        return "无投放", ""

    days_label = _compress_days(active_days)

    # 取所有活跃天的公共时段
    common_hours: set[int] = set(day_hours[active_days[0]])
    for d in active_days[1:]:
        common_hours &= set(day_hours[d])

    if common_hours:
        hours_label = _compress_hours(sorted(common_hours))
    else:
        hours_label = "各天不同"

    return days_label, hours_label


def _compress_days(indices: list[int]) -> str:
    """压缩日期索引列表为范围标签。"""
    if not indices:
        return ""
    if len(indices) == 1:
        return _DAY_NAMES[indices[0]]

    is_continuous = indices == list(range(indices[0], indices[-1] + 1))
    if is_continuous:
        return f"{_DAY_NAMES[indices[0]]}到{_DAY_NAMES[indices[-1]]}"

    return ",".join(_DAY_NAMES[i] for i in indices)


def _compress_hours(hours: list[int]) -> str:
    """压缩小时列表为范围标签。"""
    if not hours:
        return ""
    if len(hours) == 1:
        return f"{hours[0]}点"

    is_continuous = hours == list(range(hours[0], hours[-1] + 1))
    if is_continuous:
        return f"{hours[0]}点-{hours[-1] + 1}点"

    return ",".join(f"{h}点" for h in hours)
