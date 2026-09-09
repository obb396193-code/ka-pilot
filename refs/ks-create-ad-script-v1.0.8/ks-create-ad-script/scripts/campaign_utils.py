"""计划类型解析与监测链接后缀判定（preview / link_builder / render 共用）。"""

CAMPAIGN_TYPE_LABEL = {
    35: "电商下单推广",
    2: "提升应用安装",
    7: "提高应用活跃",
}

# 与 qihang-cli link build --delivery-target 候选值一致（取自模版 unit.ocpx_action_type）
OCPX_ACTION_TYPE_LABEL = {
    180: "激活",
    190: "付费",
    394: "下单",
    324: "应用唤起",
    53: "表单数",
}

ACTIVATION_OCPX_ACTION_TYPE = 180


def delivery_target_label(ocpx_action_type) -> str:
    if ocpx_action_type is None:
        return "未知"
    try:
        key = int(ocpx_action_type)
    except (TypeError, ValueError):
        return str(ocpx_action_type)
    return OCPX_ACTION_TYPE_LABEL.get(key, str(key))


def resolve_campaign_type(campaign: dict | None) -> int:
    """解析一级计划类型。优先 campaign_type（get API），其次 type（create API 字段）。"""
    if not campaign:
        return 35
    if campaign.get("campaign_type") is not None:
        return int(campaign["campaign_type"])
    if campaign.get("type") is not None:
        return int(campaign["type"])
    return 35


def is_activation_delivery_target(ocpx_action_type) -> bool:
    """投放目标是否为激活（ocpx_action_type=180）。"""
    if ocpx_action_type is None:
        return False
    try:
        return int(ocpx_action_type) == ACTIVATION_OCPX_ACTION_TYPE
    except (TypeError, ValueError):
        return False


def should_attach_track_suffix(ocpx_action_type, track_suffix: str) -> bool:
    """与 link_builder 一致：仅投放目标为激活 (ocpx_action_type=180) 且任务配置了后缀时附加。"""
    return is_activation_delivery_target(ocpx_action_type) and bool(track_suffix)


DISABLE_INSTALLED_APP_SWITCH_LABEL = {
    0: "未开启过滤已安装",
    1: "开启过滤已安装",
}


def disable_installed_app_switch_label(value) -> str:
    if value is None:
        return "未知"
    try:
        key = int(value)
    except (TypeError, ValueError):
        return str(value)
    return DISABLE_INSTALLED_APP_SWITCH_LABEL.get(key, str(key))


def resolve_disable_installed_app_switch(acct: dict | None, template_unit: dict | None) -> tuple[int, str]:
    """解析过滤已安装开关：配置优先，否则继承模版 unit.target。"""
    if acct and acct.get("disable_installed_app_switch") is not None:
        return int(acct["disable_installed_app_switch"]), "配置指定"
    target = (template_unit or {}).get("target") or {}
    return int(target.get("disable_installed_app_switch", 0)), "模版继承"


def apply_disable_installed_app_switch(unit: dict, switch_value: int) -> None:
    """写入 unit.target.disable_installed_app_switch。"""
    target = dict(unit.get("target") or {})
    target["disable_installed_app_switch"] = int(switch_value)
    unit["target"] = target
