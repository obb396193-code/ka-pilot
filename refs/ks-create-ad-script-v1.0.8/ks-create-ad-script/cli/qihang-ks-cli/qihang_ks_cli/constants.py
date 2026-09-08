"""Qihang Kuaishou OpenAPI endpoint paths and shared defaults."""

BASE_URL = "https://qh.alibaba-inc.com"

# 快手专属 OpenAPI
KUAISHOU_INVENTORY_MATERIAL_SPEC = "/qihang/api/openapi/kuaishou/inventory/material_spec"
KUAISHOU_MATERIAL_SHARE = "/qihang/api/openapi/kuaishou/material/share"
KUAISHOU_ACCOUNT_COPY = "/qihang/api/openapi/kuaishou/account/copy"

# Kuaishou Task Info（快手任务配置查询，GET 请求，走 private-dataservice-api 域名）
KUAISHOU_INFO_BASE_URL = "https://private-dataservice-api.dw.alibaba-inc.com"
KUAISHOU_INFO_PATH = "/ds-tb-erfangyinliu/project/23017/query/kuaishou_info"
KUAISHOU_INFO_APP_CODE = "E1A16AACB57E4B07BD3532FC1CAA7330"

# Defaults
DEFAULT_TENANT_ID = 10008387091  # 巨浪默认租户

KUAISHOU_INVENTORY_TYPES = [
    "KUAI_SHOU_YOU_XUAN",
    "KUAI_SHOU_LIAN_MENG",
    "KUAI_SHOU_SHANG_XIA_DA_PING",
    "ENCOURAGE_VIDEO",
    "OPEN_SCREEN",
]
