"""Qihang OpenAPI endpoint paths and shared defaults."""

BASE_URL = "https://qh.alibaba-inc.com"

# 通用 OpenAPI（全媒体）—— 已废弃，保留仅供参考
# MATERIAL_POOL_ITEM_COUNT = "/qihang/api/openapi/common/material/pool/item_count"
# MATERIAL_POOL_LIST_BY_ITEM = "/qihang/api/openapi/common/material/pool/list_by_item"

# Material Pool 查询（GET 请求，走 dataservice-api 域名）
MATERIAL_POOL_DS_BASE_URL = "https://dataservice-api.dw.alibaba-inc.com"
MATERIAL_POOL_DS_LIST_PATH = "/project/23017/query/material/pool/list"
MATERIAL_POOL_DS_COUNT_PATH = "/project/23017/query/material/pool/count"
MATERIAL_POOL_DS_APP_CODE = "E1A16AACB57E4B07BD3532FC1CAA7330"

# 与服务端 OpenApiService.MAX_PAGE_SIZE 保持一致
SERVER_MAX_PAGE_SIZE = 500

# Link（启航 RTA 临时接口，GET 请求）
LINK_GENERATE_BUILD_LINKS = "/qihang/api/rta_auto/tmp/generate_build_links"

# Text Pool（文案库查询，GET 请求，走 dataservice-api 域名）
TEXT_POOL_BASE_URL = "https://dataservice-api.dw.alibaba-inc.com"
TEXT_POOL_CVR = "/project/23017/cvr_text_pool"
TEXT_POOL_APP_CODE = "E1A16AACB57E4B07BD3532FC1CAA7330"

# Account by User（按 userId + media 查询有权限的账户列表，GET 请求，走 private-dataservice-api 域名）
ACCOUNT_USER_BASE_URL = "https://private-dataservice-api.dw.alibaba-inc.com"
ACCOUNT_USER_PATH = "/ds-tb-erfangyinliu/project/23017/account"
ACCOUNT_USER_APP_CODE = "E1A16AACB57E4B07BD3532FC1CAA7330"

# Defaults
DEFAULT_PAGE_SIZE = 50

# 字段白名单（与服务端 OpenApiMaterialField 枚举对齐）
MATERIAL_FIELDS = [
    "SIGNATURE",
    "MATERIAL_NAME",
    "MATERIAL_TYPE",
    "ITEM_ID",
    "URL",
    "POSTER_URL",
    "ITEM_PIC_URL",
    "WIDTH",
    "HEIGHT",
    "INVENTORY_NAME",
    "MATERIAL_SPEC_NAME",
]

NOT_NULL_FIELDS = ["URL", "POSTER_URL", "ITEM_PIC_URL", "WIDTH", "HEIGHT"]
