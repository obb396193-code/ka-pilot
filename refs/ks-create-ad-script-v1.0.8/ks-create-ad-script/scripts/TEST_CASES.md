# 快手广告技能回归测试用例（TDD）

## 概述

- **测试脚本**: `regression_test.py`
- **执行方式**: `python regression_test.py --advertiser-id ... --token ...`
- **测试分四阶段**: Phase 1 单元测试（无 API 调用）→ Phase 2-4 端到端测试（含实际创建）
- **通过标准**: 全部测试用例 PASS
- **总测试项**: 13 UT + 3×11 E2E = **46 项**

---

## Phase 1: 单元测试（UT，13 项）

无 API 调用，验证函数级逻辑。失败不阻断后续测试。

| ID | 名称 | 测试函数 | 输入 | 断言 |
|----|------|---------|------|------|
| UT-01 | 投放时段-工作日+时段 | `ut_schedule_weekday` | `"周一到周五, 11点-23点"` | len=168; 周一~周五 11-22 时=1; 周六/周日=0; 周一 0-10 时=0 |
| UT-02 | 投放时段-预设全天 | `ut_schedule_preset` | `"全天"` | len=168; 全部=1 |
| UT-03 | 投放时段-每天+时段 | `ut_schedule_daily` | `"每天, 9点-18点"` | len=168; 每天 9-17 时=1; 每天 0-8 和 18-23 时=0 |
| UT-04 | 投放时段标签 | `ut_schedule_label` | `"周一到周五, 11点-23点"` | label 非空; 含"周一"或"周五"; 含"11"; 含"23" |
| UT-05 | 配置校验-合法 | `ut_config_valid` | 完整配置 JSON（临时文件） | `load_config()` 返回 dict; accounts 长度=1; advertiser_id 正确 |
| UT-06 | 配置校验-缺字段 | `ut_config_invalid` | 缺少 cpa_bid/ad_num 等必填字段 | `load_config()` 抛出 `SystemExit` |
| UT-07 | 计划类型解析 | `ut_campaign_type` | `{"campaign_type": 35}` / `{"type": 2}` / `None` / `{}` | 返回 35 / 2 / 35 / 35 |
| UT-08 | 投放目标标签 | `ut_delivery_label` | 394 / 180 / 190 / None / 999 | 返回 "下单" / "激活" / "付费" / "未知" / "999" |
| UT-09 | 投放时段-原始168位串 | `ut_schedule_raw_168` | `"1"*120 + "0"*48` 及非对称串 | 原样返回, len=168 |
| UT-10 | 配置校验-策略已下线 | `ut_config_removed_strategy` | `material_strategy="默认"` | `load_config()` 抛出 `SystemExit` |
| UT-11 | 配置校验-自定义缺文件 | `ut_config_custom_no_file` | `material_strategy="自定义"` 无 `custom_materials_file` | `load_config()` 抛出 `SystemExit` |
| UT-12 | 链接监测后缀判定 | `ut_track_suffix` | `(180,"abc")` / `(394,"abc")` / `(180,"")` / `(None,"abc")` | True / False / False / False |
| UT-13 | 配置校验-账户ID重复 | `ut_config_duplicate_advertiser` | 两个 account 的 `advertiser_id` 相同 | `load_config()` 抛出 `SystemExit` |

### UT-09 详细：原始 168 位串直传

```
输入: "111111111111111111111111" × 5 + "0" × 48  (工作日全天)
期望: 原样返回, 长度=168
验证: parse_schedule_time() 对 168 位纯 0/1 串不做转换，直接返回
```

### UT-10 详细：素材策略已下线

```
输入: material_strategy="默认"
期望: load_config() → sys.exit(1)
原因: "默认"策略已下线，合法值为"素材库"或"自定义"
```

### UT-11 详细：自定义策略缺文件

```
输入: material_strategy="自定义", 无 custom_materials_file
期望: load_config() → sys.exit(1)
原因: 自定义策略必须提供 custom_materials_file 路径
```

### UT-12 详细：链接监测后缀判定

```
should_attach_track_suffix(ocpx_action_type, track_url_suffix):
  - (180, "abc") → True   激活类 + 有后缀 → 追加监测后缀
  - (394, "abc") → False  非激活类 → 不追加
  - (180, "")   → False   激活类但无后缀 → 不追加
  - (None, "abc") → False  无 ocpx → 不追加
```

### UT-13 详细：多账户 advertiser_id 重复

```
输入: {"accounts": [{...advertiser_id="123456"...}, {...advertiser_id="123456"...}]}
期望: load_config() → sys.exit(1)
原因: 同一批配置中不允许 advertiser_id 重复
```

---

## Phase 2-4: 端到端测试（E2E，3 轮 × 11 步）

每轮完整执行广告创建流程，逐步校验。**任一步骤失败即停止该轮**。

### E2E 轮次定义

| 轮次 | 标签 | schedule_time | ad_num | 验证重点 |
|------|------|--------------|--------|---------|
| E2E-1 | 基础场景 | ✅ 指定 | 1 | 完整流程含时段解析与写入 |
| E2E-2 | 无投放时段 | ❌ 不指定 | 1 | unit_payload 中无 schedule_time 字段 |
| E2E-3 | 多广告数 | ✅ 指定 | 2 | 多组素材/多链接/多 payload/多广告创建 |

### 每轮 11 步

| Step | 名称 | 测试函数 | 依赖 | 关键断言 |
|------|------|---------|------|---------|
| 1 | 配置校验 | `step_config` | - | `load_config()` 不抛异常; advertiser_id 非空 |
| 2 | 模版拉取 | `step_template` | Step 1 | JSON 文件存在; `campaign_type` 非空; `ocpx_action_type` 非空 |
| 3 | 账户上下文 | `step_context` | Step 1 | `task_id` / `page_id` / `kol_user_id` 均非空 |
| 4 | 素材分组 | `step_materials` | Step 2 | `material_groups.json` 存在; ≥1 组; 每组 ≥1 素材含 `signature` |
| 5 | 素材共享/上传 | `step_acquire` | Step 4 | `uploaded_materials.json` 存在; ≥1 条 success |
| 6 | 文案获取 | `step_captions` | Step 1 | `captions.json` 存在; ≥1 条文案 |
| 7 | 链接生成 | `step_links` | Step 2,3 | `links.json` 存在; ≥1 组链接 |
| 8 | Payload 渲染 | `step_render` | Step 2,3,4,7 | `campaign/unit/creative_payload` 文件均存在 |
| 9 | 投放时段验证 | `step_schedule` | Step 8 | 有时段: payload schedule_time=解析结果; 无时段: payload 无该字段 |
| 10 | 预览展示 | `step_preview` | Step 1 | `preview_confirm.py` 退出码=0; 输出含账户/出价/广告数 |
| 11 | 广告创建 | `step_create` | Step 1-10 | `campaign_id` 非空; units N/N; creatives N/N |

### 跨 Step 数据传递

```
Step 2 → state["template"]   (fetch_template 返回的提取后 dict, 非 JSON 原始响应)
Step 3 → state["context"]    (get_account_context 返回的完整 dict)
Step 4 → material_groups.json (文件)
Step 5 → uploaded_materials.json (文件)
Step 6 → captions.json (文件)
Step 7 → links.json (文件)
Step 8 → campaign_payload.json + unit_payload_*.json + creative_payload_*.json (文件)
```

### E2E-2 无投放时段 - 关键验证点

```
1. acct 中不设 schedule_time
2. step_config 写入的 ad_config.json 中无 schedule_time 字段
3. step_schedule 验证 unit_payload 中 schedule_time 字段不存在或为 None
4. step_preview 不检查 schedule_time
5. 广告创建成功，campaign/unit/creative 均创建
```

### E2E-3 多广告数 - 关键验证点

```
1. ad_num=2 → 素材分组产生 2 组（6 个素材）
2. 素材共享/上传处理 2 组（6 个 photo_id）
3. 链接生成 2 组链接
4. Payload 渲染 2 个 unit_payload + 2 个 creative_payload
5. 广告创建: 1 campaign + 2 units + 2 creatives
6. 验证 units_created==units_total (2/2), creatives_created==creatives_total (2/2)
```

---

## 测试报告

### 终端输出格式

```
================================================================
  快手广告技能回归测试（TDD 驱动）
================================================================
  ...
  测试项: 13 UT + 3×11 E2E = 46 项
================================================================

  ── Phase 1: 单元测试（13 项）──

  [ 1/46] PASS  UT-01 投放时段-工作日       (0.0s)
  ...
  [13/46] PASS  UT-13 配置校验-账户ID重复    (0.0s)

  ── E2E-1: 基础场景(含时段,1广告)（11 步）──

  [14/46] PASS  [E2E-1] 配置校验            (0.0s)
  ...
  [24/46] PASS  [E2E-1] 广告创建             (5.3s)

  ── E2E-2: 无投放时段（11 步）──
  ...

  ── E2E-3: 多广告数(含时段,2广告)（11 步）──
  ...

================================================================
  回归测试报告
================================================================
  Phase 1 单元测试: 13/13 通过
  E2E-1 基础场景: 11/11 通过
  E2E-2 无投放时段: 11/11 通过
  E2E-3 多广告数: 11/11 通过
  总计: 46/46 通过, 0 失败, 总耗时 60.6s
  报告: /path/to/test_report.json
================================================================
```

### JSON 报告格式

```json
{
  "timestamp": "2026-06-22T11:46:01",
  "total_cases": 46,
  "passed": 46,
  "failed": 0,
  "total_elapsed_seconds": 60.6,
  "phases": {
    "unit":  { "total": 13, "passed": 13, "failed": 0 },
    "E2E-1": { "total": 11, "passed": 11, "failed": 0 },
    "E2E-2": { "total": 11, "passed": 11, "failed": 0 },
    "E2E-3": { "total": 11, "passed": 11, "failed": 0 }
  },
  "cases": [...]
}
```

---

## 回归测试使用方式

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
  --ad-num <基础广告数, E2E-3自动用max(此值,2)> \
  --group-size <每组素材数> \
  --schedule-time "周一到周五, 11点-23点"
```

**改动技能后**: 直接运行上述命令，46 项测试全 PASS 即回归通过。

### 未覆盖场景

以下场景因需特殊条件或无法确定性触发，暂未纳入自动回归：

| 场景 | 原因 | 建议验证方式 |
|------|------|------------|
| schedule_time 跨周范围 (如"周六到周一") | `_parse_days` 不支持回绕 | 手动调用 `parse_schedule_time()` 验证 |
| 素材剔除重试 | 仅在创意创建失败时触发（间歇性） | 观察 `material_prune_warnings` |
| 自定义素材策略 E2E | 需准备 custom_materials_file | 手动指定策略后跑单轮 |
| 多账户 E2E | 需多个测试账户 | 手动多账户配置 |
