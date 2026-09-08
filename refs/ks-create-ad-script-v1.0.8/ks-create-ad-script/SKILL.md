---
name: ks-create-ad-script
description: >-
  通过 ad_config.json 配置与 create_ads.py 脚本，端到端完成快手多账户广告创建（模版拉取、素材、链接、渲染、123 级创建）。
  当用户提到脚本创建广告、批量脚本创建、ks脚本创建、快手脚本创建广告、自动化广告创建时使用。
dependencies:
  - kuaishou-cli
  - qihang-cli
  - qihang-ks-cli
  - algorithm-cli
---

# 快手广告脚本化创建

用户已有线上广告作模版（`campaign_id` + `unit_id`），希望配置多账户并由脚本一次性创建。

- **Agent**：澄清参数 → 写配置 → 预览确认 → 触发 `create_ads.py` → 读报告汇报
- **脚本**：模版/素材/链接/渲染/创建全流程，见 [scripts/README.md](scripts/README.md)

---

## Agent 职责（5 步）

| 步骤 | 动作 |
|------|------|
| 1 | 与用户澄清参数（见下） |
| 2 | 写入 `$OUTPUT_DIR/ad_config.json` |
| 3 | 运行 `preview_confirm.py`，**原样展示** stdout，等用户确认 |
| 4 | 用户确认后运行 `create_ads.py` |
| 5 | 读 `report.json` / `account_report.json` 完整汇报 |

---

## Agent 红线

1. **Step 1 完成前禁止写配置**
2. **Step 3 确认前禁止执行创建**（定时任务模式除外，见下）
3. **算法推荐策略需要模版 scene_id 和账户 page_id** — 缺少任一则拒绝执行
4. **失败不自动修复** — 只汇报 error/details，等用户决定；禁止改 payload 重试
5. **报告须完整** — 成功展示 `material_summary` / `render_summary` / `signature_filter`；失败原样展示错误
6. **定时任务必须且只能跑 `create_ads.py`** — 禁止拆步子脚本、禁止复用历史中间产物
7. **出价单位不明确时必须追问** — 用户只说「出价 30」「CPA 30」等未标明元/厘时，**禁止自行假设**；须确认后再写入 `cpa_bid`（见下「出价单位」）

### 定时任务模式

用户/调度明确为 Cron、无人值守等 → 跳过 Step 3，写完配置直接 Step 4。脚本不做模式检测，由 Agent 判断。

---

## 执行前检查

`create_ads.py` 启动时自动检测 CLI 依赖，缺失时从仓库 `cli/` 目录自动 `pip install`，无需 Agent 手动检查。

也可单独运行检测：

```bash
python scripts/ensure_deps.py
```

Token 通过 CLI wrapper 注入 `--token`，**勿写入** `ad_config.json`。

---

## 工作目录

`$OUTPUT_DIR` = skill 上溯 2 级 → avatar 根 → `sessions/{JULANG_OS_SESSION_ID}/tmp`（默认 `default`）

| 路径 | 用途 |
|------|------|
| `ad_config.json` | Agent 写入的配置 |
| `report.json` | 汇总报告 |
| `{advertiser_id}/` | 账户级产物 |

---

## Step 1: 澄清参数

逐账户收集（可一轮收齐）：

```
1. advertiser_id
2. 模版三件套：template_account_id / campaign_id / unit_id
3. cpa_bid（厘）/ ad_num / group_size（默认 15）/ material_strategy
4. 素材库 → pool_id 或 pool_ids；自定义 → custom_materials_file（.json）；算法推荐 → 无需额外字段
5. 可选：text_pool_id / action_bar / expose_tags / page_id / disable_installed_app_switch / schedule_time
```

### 出价单位（`cpa_bid`）

脚本与 `ad_config.json` **一律使用厘**；与快手 OCPX 接口一致：

| 换算 | 公式 |
|------|------|
| 元 → 厘 | `cpa_bid = 元 × 1000`（例：30 元 → `30000`） |
| 厘 → 元 | `元 = cpa_bid ÷ 1000`（例：`30000` → 30 元） |

**Agent 必须确认单位的场景**（未写清「元」或「厘」即视为不明确）：

- 「出价 30」「CPA 30」「30 块」「bid 30」等

向用户确认示例：

```
您说的出价 30，是指 30 元（配置写入 cpa_bid=30000）还是 30 厘（cpa_bid=30）？
```

- 用户明确说「30 元 / 30块 / 三十元」→ 写入 `30000`，无需再问
- 用户明确说「30 厘」→ 写入 `30`
- **禁止**在未确认时将裸数字默认当作元或厘

预览与执行时 `preview_confirm.py` 会同时展示厘与元，供用户二次核对。

### 投放时段（`schedule_time`）

可选字段。用户未指定时不设置该字段，新广告按账户默认**全天投放**。

**澄清格式：周期 + 时段**，示例：

| 用户输入 | 含义 | 配置写入 |
|---------|------|---------|
| `周一到周五, 11点-23点` | 工作日 11:00-23:00 投放 | `"schedule_time": "周一到周五, 11点-23点"` |
| `周一至周日, 9-22` | 每天 9:00-22:00 投放 | `"schedule_time": "周一至周日, 9-22"` |
| `工作日` | 工作日全天投放 | `"schedule_time": "工作日"` |
| `周末` | 仅周末全天投放 | `"schedule_time": "周末"` |
| `全天` | 每天全天投放 | `"schedule_time": "全天"` |

**周期格式**：`周一到周五` / `周一至周日` / `周六到周日` / `周一,周三,周五`（逗号分隔单天）

**时段格式**：`11-23` 或 `11点-23点`（起始小时-结束小时，结束为排他上界，即 11:00-23:00 投放）

脚本内部将自然语言转换为快手 API 的 168 位 0/1 字符串（7天×24小时，周一00:00起，1=投放），写入 `unit.schedule_time`。

**Agent 澄清示例**：

```
请确认投放时段，格式为「周期 + 时段」，例如：
  - 周一到周五, 11点-23点（工作日白天投放）
  - 全天（每天24小时投放）
  - 工作日（工作日全天）
  - 周末（仅周末全天）
如不指定则按账户默认全天投放。
```

### 必填字段

| 字段 | 说明 |
|------|------|
| `advertiser_id` | 目标账户 |
| `template_account_id` | 模版账户 |
| `campaign_id` / `unit_id` | 模版 1、2 级 ID |
| `cpa_bid` | OCPX 出价，**整数厘**（1 元 = 1000 厘；30 元 = `30000`） |
| `ad_num` | 创建广告数 |
| `group_size` | 每条广告素材数，默认 15 |
| `material_strategy` | `素材库` \| `自定义` \| `算法推荐` \| `算法推荐AB` |
| `text_pool_id` | 文案库，常用 357 |
| `pool_id` / `pool_ids` | 素材库策略必填，支持多库并集如 `"79626,80700"` |
| `custom_materials_file` | 自定义策略必填 |

### 算法推荐策略

不需要额外配置字段。运行时自动从模版和账户上下文获取过滤条件：

| 来源 | 字段 | 用途 |
|------|------|------|
| 模版二级 `unit.scene_id` | csite | 版位 ID 过滤（与算法系统 csite 一致） |
| 账户上下文 `page_id` | delivery_page_id | 承接页过滤 |
| 固定值 | media=KUAISHOU | 媒体过滤 |

素材按算法 `predict_score` 降序排列，先圈 top N 发现商品，再按商品维度为每条广告圈选 `group_size` 条素材。

### 算法推荐AB策略

在素材查询（素材库）与算法推荐之间做AB实验。`ad_num` 拆为两半，一半由素材库查询获取，一半由算法推荐获取。

**必填字段**: `pool_id`/`pool_ids`（素材查询半使用），`page_id`（可选，算法推荐半从任务信息自动获取）。

**处理流程**: 两路素材分阶段独立处理，各自经过 acquire → link → render，最终合并创建。

**命名规则**:
- 一级计划名: `ab-` 前缀
- 素材查询组广告名: 无前缀（与素材库策略一致）
- 算法推荐组广告名: `sf-` 前缀（与算法推荐策略一致）

**拆分规则**: `pool_num = ad_num // 2`, `algo_num = ad_num - pool_num`（奇数时算法推荐多 1 组）

### 可选字段

| 字段 | 说明 |
|------|------|
| `action_bar` / `expose_tags` | 省略则从模版三级创意继承 |
| `page_id` | 省略则从任务信息解析 |
| `disable_installed_app_switch` | `0` 不过滤 / `1` 过滤已安装；省略则继承模版 |
| `schedule_time` | 投放时段，如 `"周一到周五, 11点-23点"`；省略则按账户默认全天投放 |

### 模版选型提示

| 需求 | 建议模版特征 |
|------|-------------|
| 过滤已安装 | 应用安装类（`campaign_type=2`），**勿用**电商下单（35 + ocpx 394） |
| 监测链接后缀 | 投放目标须为激活（`ocpx_action_type=180`） |

字段枚举详见 [scripts/README.md#字段枚举](scripts/README.md#字段枚举-campaign_utilspy)。

### Checklist

- [ ] `group_size` 已确认
- [ ] 素材策略与对应 pool/自定义文件齐全
- [ ] `advertiser_id` 无重复
- [ ] `cpa_bid` 单位已确认（元/厘），且已换算为厘写入配置
- [ ] `schedule_time` 已确认（如用户指定了投放时段）

---

## Step 2: 写配置

`cpa_bid` 存厘：上例 `30000` = 30 元。

```json
{
  "accounts": [
    {
      "advertiser_id": "108714412",
      "template_account_id": "108714412",
      "campaign_id": 9607046512,
      "unit_id": 28463417883,
      "cpa_bid": 30000,
      "ad_num": 4,
      "group_size": 5,
      "material_strategy": "素材库",
      "text_pool_id": 357,
      "pool_id": "80700",
      "disable_installed_app_switch": 0,
      "schedule_time": "周一到周五, 11点-23点"
    }
  ]
}
```

---

## Step 3: 预览确认

```bash
python scripts/preview_confirm.py --config "$OUTPUT_DIR/ad_config.json"
```

**禁止**手写占位摘要；必须运行脚本并原样展示 stdout。

预览解析与执行一致的字段：计划类型、投放目标、task_id、承接页、过滤已安装、监测后缀等。

示例（电商下单模版）：

```
=== 广告创建确认 ===
账户数: 1

[账户 1] advertiser_id=108714412
  模版: campaign_id=9607046512, unit_id=28463417883
  计划类型: 电商下单推广 (campaign_type=35)
  投放目标: 下单 (ocpx_action_type=394)
  ...
  过滤已安装: 未开启过滤已安装 (disable_installed_app_switch=0, 配置指定)
  监测链接后缀: 否 (投放目标=下单，非激活；...)
```

用户拒绝 → 回到 Step 1/2。

---

## Step 4: 执行

```bash
python scripts/create_ads.py --config "$OUTPUT_DIR/ad_config.json"
```

---

## Step 5: 汇报

读 `report.json`；失败读 `{advertiser_id}/account_report.json` 及 `unit_results.json` / `creative_results.json`。

若 `account_report.json` 含 `signature_filter` 字段，须汇报素材签名过滤统计：

```
📋 素材签名过滤
总素材: 75 | 通过: 72 | 过滤: 3（阈值: 使用次数 > 10）

被过滤素材:
- signature=004e... usageCount=15 (素材名)
- ...
```

若 `signature_filter.filtered` 为 0，简报「签名过滤: 75 条素材全部通过」即可。

```
=== 执行完成 ===
总账户: 1 | 成功: 1 | 失败: 0

[OK] 108714412: campaign=xxx, units=4/4, creatives=4/4
```

失败 `stage` 速查：template / context / material / captions / link / render / create — 详见 [scripts/README.md](scripts/README.md)。

执行完成后可询问用户是否清理本次 `$OUTPUT_DIR` 产物。

---

## 目录结构

```
ks-create-ad-script/
├── SKILL.md              # 本文件：Agent 编排
├── .gitignore
├── cli/                  # CLI 工具源码副本（随 skill 部署，自动安装）
│   ├── algorithm-cli/
│   ├── kuaishou-cli/
│   ├── qihang-cli/
│   └── qihang-ks-cli/
└── scripts/
    ├── README.md         # 脚本流程、枚举、约束
    ├── ensure_deps.py    # CLI 依赖检测与安装
    ├── create_ads.py     # 主入口
    ├── preview_confirm.py
    └── …（见 scripts/README.md 主流程图）
```
