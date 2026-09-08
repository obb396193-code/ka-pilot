"""Kuaishou MAPI endpoint constants used by the CLI."""

BASE_URL = "https://ad.e.kuaishou.com/rest/openapi/"

# Account
ADVERTISER_INFO = "v1/advertiser/info"
ADVERTISER_FUND_GET = "v1/advertiser/fund/get"
ADVERTISER_BUDGET_GET = "v1/advertiser/budget/get"
ADVERTISER_BUDGET_UPDATE = "v1/advertiser/update/budget"
ADVERTISER_FLOWS = "v1/advertiser/fund/daily_flows"

# Campaign / unit / creative
CAMPAIGN_LIST = "gw/dsp/campaign/list"
CAMPAIGN_CREATE = "gw/dsp/campaign/create"
UNIT_LIST = "gw/dsp/unit/list"
UNIT_CREATE = "gw/dsp/unit/create"
UNIT_UPDATE = "gw/dsp/unit/update"
UNIT_UPDATE_STATUS = "v1/ad_unit/update/status"
UNIT_UPDATE_BID = "v1/ad_unit/update/bid"
CREATIVE_LIST = "gw/dsp/creative/list"
CREATIVE_CREATE = "gw/dsp/creative/create"
PROGRAM_CREATIVE_LIST = "gw/dsp/advanced_creative/list"
PROGRAM_CREATIVE_CREATE = "gw/dsp/advanced_creative/create"

# Material
IMAGE_LIST = "v1/file/ad/image/list"
IMAGE_UPLOAD = "v2/file/ad/image/upload"
IMAGE_GET = "v1/file/ad/image/get"
VIDEO_LIST = "v1/file/ad/video/list"
VIDEO_LIST_BY_CURSOR = "gw/dsp/video/listByCursor"
VIDEO_UPLOAD = "v2/file/ad/video/upload"
VIDEO_GET = "v1/file/ad/video/get"
VIDEO_SHARE_NEW = "gw/dsp/v1/file/ad/video/share/new"

# Native
NATIVE_AUTH_LIST = "gw/dsp/v1/native/auth/list"

DEFAULT_PAGE_SIZE = 20
