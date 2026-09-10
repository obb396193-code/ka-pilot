# 1093/1280/1440 视口横向溢出实测（arch 2026-09-09，本地生产构建 headless Chrome）

1093 = Windows 1366×768 @125% 的 CSS 视口宽；1280 = 1920×1080 @150%。

| 视口宽 | 页面 | 横向溢出 |
|---|---|---|
| 1093 | `/accounts` | 48px |
| 1093 | `/data` | 65px |
| 1093 | `/tasks` | 65px |
| 1093 | `/tasks/1803240580` | 131px |
| 1093 | `/work-items/inbox` | 197px |
| 1093 | `/reports` | 32px |
| 1093 | `/settings` | 32px |
| 1093 | `/admin` | 65px |
| 1280 | `/accounts` | 0px |
| 1280 | `/data` | 0px |
| 1280 | `/tasks` | 0px |
| 1280 | `/tasks/1803240580` | 0px |
| 1280 | `/work-items/inbox` | 10px |
| 1280 | `/reports` | 0px |
| 1280 | `/settings` | 0px |
| 1280 | `/admin` | 0px |
| 1440 | `/accounts` | 0px |
| 1440 | `/data` | 0px |
| 1440 | `/tasks` | 0px |
| 1440 | `/tasks/1803240580` | 0px |
| 1440 | `/work-items/inbox` | 0px |
| 1440 | `/reports` | 0px |
| 1440 | `/settings` | 0px |
| 1440 | `/admin` | 0px |

截图：`1093-*.jpg`（工作项详情 / 账户池 / 任务详情），`1280-work_items_inbox.jpg` 对照。

## 修后复验（2026-09-10，fe F8-10 合 main `9c84581a`，web build stOIE0Y1xlLUiLnhLcRHT）
1093 / 1280 / 1440 三档 × 8 页 = 24 项**横向溢出全部 0px**（`scripts/ui/overflow-check.mjs` 实跑）。修后截图 `after-1093-*.jpg`。内网 Win 机 100% 缩放真机验收待 OS 部署新版。
