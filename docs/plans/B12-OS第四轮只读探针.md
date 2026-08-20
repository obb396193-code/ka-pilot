# B12 OS 第四轮只读探针

> 目的：为广告 ID 权威拆分和素材视频来源提供真实证据。仅只读、小样本，不执行任何媒体写操作。

## A. 广告对象标识

1. 实读可用 skill/CLI，找到账户下广告/广告组对象的只读列表接口、分页字段和真实响应结构。
2. 对本人有权限的一个账户读取两页小样本，确认 page/page_size 是否真正生效、是否有 total/hasMore。
3. 在同账户同日期取 `ad_realtime` 小样本，比较对象列表 `unit_id` 与 `ad_realtime.ad_id`：
   - 是同一标识；
   - 可通过另一字段映射；
   - 完全不同。
4. 回传只给字段名、集合关系、行数和哈希摘要，不给真实 ID。

## B. 素材视频来源

1. 用 `qihang-cli material count` 找到一个本人有权限的小样本商品范围，再用 `material list` 只请求 `SIGNATURE MATERIAL_TYPE URL POSTER_URL WIDTH HEIGHT`。
2. 确认视频行的 `material_url` 是否存在、协议/host 类型、是否短期签名 URL。
3. 对一个视频 URL 仅做 HEAD；若 HEAD 不支持，做 `Range: bytes=0-0`，记录状态、Content-Type、Content-Length、Accept-Ranges、重定向次数，不下载正文。
4. 判断 Multica 沙箱可达不等于产品 FaaS 可达；若能在本项目预期 FaaS 网络做同样最小探针，单独标证据。

## C. 回传格式

- `真实执行`、`源码确认`、`文档确认`、`合理推断` 四级分开。
- 结论、脱敏请求模板、响应字段集合、分页事实、ID 映射、URL 可达性、产品后端建议、仍未验证项。
- 禁止回传 token、完整 URL、真实 ID、金额和响应原文。
