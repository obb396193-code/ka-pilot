# 脚本实现说明

`create_ads.py` 端到端负责：模版拉取 → 账户上下文 → 素材 → 文案 → 链接 → 渲染 → 123 级创建。

Agent 只写配置、跑预览/创建、读报告；**不**手改 payload 或中间产物。

## 主流程

```
create_ads.py                 # 唯一执行入口（含渲染调用 + 文案采样）
├── template_fetcher.py       # 模版 123 级
├── account_context.py        # task_id / page_id / kol_user_id / track_suffix
├── material_pipeline.py      # 素材库 / 自定义 → 分组 + 共享/上传
├── group_materials_pool.py   # 素材库分组（material_pipeline 调用）
├── group_materials_custom.py # 自定义素材分组
├── acquire_materials.py      # 素材共享/上传（含 qihang 批量共享）
├── upload_materials.py       # 视频上传
├── link_builder.py           # 每组独立 link build
├── render_from_template.py   # 清洗模版 + 渲染 payload
├── schedule_utils.py         # 投放时段解析（自然语言 → 168位0/1串）
├── batch_create.py           # 123 级 batch 创建 + 重试
├── ad_creator.py             # 创建编排
├── creative_material_retry.py# 三级素材失败剔除重试
├── preview_confirm.py        # Step 3 确认摘要（Agent 单独调用）
├── config_loader.py          # ad_config 校验
├── campaign_utils.py         # 计划类型 / 投放目标 / 过滤已安装 / 监测后缀
└── regression_test.py        # 回归测试（独立运行，不影响主流程）
```

## 回归测试（TDD 驱动）

测试用例定义见 `TEST_CASES.md`，测试脚本 `regression_test.py` 按 TDD 执行全量回归。

分四阶段执行共 46 项测试：
- **Phase 1 单元测试（13 项）**：无 API 调用，验证函数级逻辑（投放时段解析、配置校验、监测后缀等）
- **Phase 2 E2E-1 基础场景（11 步）**：含投放时段, ad_num=1
- **Phase 3 E2E-2 无投放时段（11 步）**：不指定 schedule_time, 验证 payload 无该字段
- **Phase 4 E2E-3 多广告数（11 步）**：含投放时段, ad_num=2, 验证多组素材/多链接/多创建

```bash
python regression_test.py \
  --advertiser-id <测试账户ID> \
  --token <KUAISHOU_ACCESS_TOKEN> \
  --template-account-id <模版账户ID> \
  --campaign-id <模版一级ID> \
  --unit-id <模版二级ID> \
  --pool-id <素材库ID> \
  --text-pool-id <文案库ID> \
  --cpa-bid <出价厘> \
  --ad-num <广告数> \
  --group-size <每组素材数> \
  --schedule-time "周一到周五, 11点-23点"
```

### Phase 1: 单元测试（13 项）

| ID | 名称 | 断言 |
|----|------|------|
| UT-01 | 投放时段-工作日+时段 | len=168; Mon-Fri 11-22=1; Sat/Sun=0 |
| UT-02 | 投放时段-预设全天 | len=168; all=1 |
| UT-03 | 投放时段-每天+时段 | len=168; 每天 9-17=1 |
| UT-04 | 投放时段标签 | label 非空, 含星期和时段 |
| UT-05 | 配置校验-合法 | load_config 返回 dict |
| UT-06 | 配置校验-缺字段 | load_config 抛 SystemExit |
| UT-07 | 计划类型解析 | campaign_type / type / 默认值 |
| UT-08 | 投放目标标签 | 394=下单 / 180=激活 / None=未知 |
| UT-09 | 投放时段-原始168位串 | 原样返回, len=168 |
| UT-10 | 配置校验-策略已下线 | "默认"→SystemExit |
| UT-11 | 配置校验-自定义缺文件 | 无 custom_materials_file→SystemExit |
| UT-12 | 链接监测后缀判定 | 激活+有后缀→True; 其余→False |
| UT-13 | 配置校验-账户ID重复 | 重复 advertiser_id→SystemExit |

### Phase 2-4: 端到端测试（3 轮 × 11 步）

| 轮次 | 标签 | schedule_time | ad_num | 验证重点 |
|------|------|--------------|--------|--------|
| E2E-1 | 基础场景 | ✅ 指定 | 1 | 完整流程含时段解析与写入 |
| E2E-2 | 无投放时段 | ❌ 不指定 | 1 | unit_payload 中无 schedule_time 字段 |
| E2E-3 | 多广告数 | ✅ 指定 | 2 | 多组素材/多链接/多 payload/多广告创建 |

每轮 11 步：

| Step | 测试内容 | 关键断言 |
|------|---------|--------|
| 1 | 配置校验 | load_config 不抛异常 |
| 2 | 模版拉取 | template_*.json 存在；campaign_type / ocpx_action_type 非空 |
| 3 | 账户上下文 | task_id / page_id / kol_user_id 非空 |
| 4 | 素材分组 | ≥1 组，每组 ≥1 素材含 signature |
| 5 | 素材共享/上传 | ≥1 条 success |
| 6 | 文案获取 | ≥1 条文案 |
| 7 | 链接生成 | ≥1 组链接 |
| 8 | Payload 渲染 | campaign / unit / creative payload 文件均存在 |
| 9 | 投放时段验证 | 有时段: payload schedule_time=解析结果; 无时段: payload 无该字段 |
| 10 | 预览展示 | 预览输出含账户/出价/广告数等关键字段 |
| 11 | 广告创建 | campaign_id 非空；units N/N；creatives N/N |

任一步骤失败即停止该轮，输出 `test_report.json`（含每步状态、耗时、错误详情）。

## 输出目录

```
skill 上溯 2 级 → avatar 根 → sessions/{JULANG_OS_SESSION_ID}/tmp/
├── ad_config.json
├── report.json
└── {advertiser_id}/
    ├── template_*.json
    ├── material_groups.json
    ├── links.json
    ├── *_payload_*.json
    └── account_report.json
```

## 字段枚举（`campaign_utils.py`）

### 一级 `campaign_type`

| 值 | 含义 |
|----|------|
| 35 | 电商下单推广 |
| 2 | 提升应用安装 |
| 7 | 提高应用活跃 |

### 二级 `ocpx_action_type`（= link `--delivery-target`）

| 值 | 含义 |
|----|------|
| 180 | 激活 |
| 190 | 付费 |
| 394 | 下单 |
| 324 | 应用唤起 |
| 53 | 表单数 |

### 过滤已安装 `disable_installed_app_switch`（`unit.target`）

| 值 | 含义 |
|----|------|
| 0 | 未开启 |
| 1 | 开启 |

**场景限制**：仅部分营销目标支持（如应用安装类 `campaign_type=2`）。电商下单（`campaign_type=35` + `ocpx=394`）开启时会报「不支持的营销目标场景」。

### 监测链接后缀

仅当 `ocpx_action_type=180`（激活）且任务配置了 `track_suffix` 时，`link_builder` 传 `--track-suffix`。

### 投放时段（`schedule_time`）

可选配置字段，支持自然语言格式，由 `schedule_utils.py` 转换为快手 API 的 168 位 0/1 字符串。

| 配置值 | 含义 |
|-------|------|
| `周一到周五, 11点-23点` | 工作日 11:00-23:00 投放 |
| `周一至周日, 9-22` | 每天 9:00-22:00 投放 |
| `工作日` | 工作日全天 |
| `周末` | 仅周末全天 |
| `全天` / `每天` | 每天 24 小时 |
| 168 位 0/1 串 | 直接使用原始值 |

**位序**：第 1 位 = 周一 00:00，第 168 位 = 周日 23:00，`1`=投放。与 `kuaishou-cli unit update-schedule` 一致。

**未指定时**：不设置 `unit.schedule_time` 字段，新广告按账户默认全天投放。

## 渲染清洗（`render_from_template._clean_unit`）

| 规则 | 说明 |
|------|------|
| `UNIT_KEEP_FIELDS` | 只保留白名单字段；含 `app_store`、`use_app_market` |
| 剔除 `xiaomi` | 模版 `app_store` 含已下线的小米直投时自动去掉，避免创建报错 |
| `disable_installed_app_switch` | 配置覆盖 > 模版 `unit.target` 继承 |

## 实现约束

| 约束 | 位置 |
|------|------|
| 账户目录隔离 | `resolve_output_dir()` |
| 每组独立 link build | `link_builder.py`（`qihang-cli link build` 组级并发上限 5） |
| `kol_user_id` 按目标账户查 | `account_context.py` |
| `task_id` 来自接口 | `account_context.py` |
| 三级固定 `creative create-program` | `ad_creator.py` |
| `advertiser_id` 不可重复 | `config_loader.py` |
| token/限流重试 1 次 | `retry_utils.py` |

## 素材容错

1. 共享/上传单条失败 → WARN，继续
2. 渲染跳过失败素材；组内 `photo_list` 为空则跳过该组
3. 全部组无法渲染（`rendered=0`）→ render 失败
4. 三级创建素材层失败 → 解析 `photo_id` 剔除后重试（`creative_material_retry.py`）

## 配置校验

`config_loader.py`：必填字段、素材策略、`cpa_bid`/`ad_num`/`group_size`；`disable_installed_app_switch` 须为 `0` 或 `1`；`schedule_time` 格式校验（可选）；「算法」策略拒绝。

### `cpa_bid` 单位

- 配置与脚本内部**一律为厘**（整数）
- **1 元 = 1000 厘**（30 元 → `30000`）
- Agent 澄清阶段须确认单位；`preview_confirm.py` 输出同时展示「X 厘 (Y 元)」供核对

## 创建失败分类（`batch_create.py`）

| fix_layer | 说明 |
|-----------|------|
| auth | token 过期 |
| material | 素材横竖版/尺寸/photo_id |
| link | 链接无效 |
| param | payload 参数 |
| retry | 网络瞬态 |
| inspect | 未识别，展示原始 error |
