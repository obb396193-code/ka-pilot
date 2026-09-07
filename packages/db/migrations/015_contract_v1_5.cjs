// Contract v1.5 + v1.5.1 + v1.7.1 identity_preferences (R-014 / be2). Additive only; no public routes.
// DDL is transcribed verbatim from packages/contract/schema.sql (the single authority) —
// v1.5 block, v1.5.1 block and the v1.7.1 identity_preferences table. Do not hand-edit the
// statements here: change schema.sql first, then this file, and test/r014 will compare them.
// Run before workers in a stopped-write maintenance window. Refuse lossy downgrade.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

-- v1.5 新增（2026-09-05 arch；13 条"有名无 DTO"冻结；Codex R-014 出 migration 015）
-- =====================================================================
CREATE TABLE external_changes (        -- 4.3/11.7 带外变更：结构同步比对出的非本系统变更
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  media TEXT NOT NULL, account_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id, media, account_id) REFERENCES accounts(workspace_id, media, account_id),
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, field TEXT NOT NULL,   -- campaign|unit|creative；bid|budget|status|schedule
  from_value JSONB, to_value JSONB,     -- typed value，与 changeset_items 同构
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(), sync_run_id UUID,
  linked_work_item_id UUID
);
CREATE INDEX idx_external_changes_account ON external_changes(workspace_id, media, account_id, detected_at DESC);

CREATE TABLE account_transfers (        -- 4.10 交接
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  from_user_id UUID NOT NULL, to_user_id UUID NOT NULL, initiated_by UUID NOT NULL,
  items JSONB NOT NULL,                 -- [{media, account_id}]
  include JSONB NOT NULL,               -- {work_items, dispatches, starred}
  moved JSONB,                          -- {accounts, work_items, dispatches}
  note TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_watchlists (          -- 3.5 盯盘名单（个人）
  workspace_id UUID NOT NULL, user_id UUID NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',    -- [{media, account_id}]
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE saved_views (              -- 3.10 个人视图（列/筛选/排序/窗口）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  owner_user_id UUID NOT NULL, page TEXT NOT NULL,   -- data.table|data.pivot|accounts|tasks|work_items|data.live
  name TEXT NOT NULL, config JSONB NOT NULL,         -- {version:"view/v1", filters, columns, sort, window}
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, owner_user_id, page, name)
);

CREATE TABLE exports (                  -- 7.4 任务化导出
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL, user_id UUID NOT NULL,
  kind TEXT NOT NULL,                   -- query|view|report
  ref JSONB NOT NULL, format TEXT NOT NULL,        -- xlsx|png|pdf
  status TEXT NOT NULL DEFAULT 'queued', -- queued|running|done|failed
  file_ref TEXT, bytes BIGINT, error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ, expires_at TIMESTAMPTZ
);

CREATE TABLE capabilities (             -- 5.7 Capability Registry（B7 内核的持久化）
  key TEXT PRIMARY KEY, name TEXT NOT NULL,
  category TEXT NOT NULL,               -- query|write|infra|account|material
  form_schema JSONB NOT NULL,           -- JSON Schema
  permission TEXT NOT NULL, version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'documented_unverified',   -- documented_unverified|verified|disabled
  executor TEXT NOT NULL,               -- product_direct|runtime|multica_run
  media TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE decision_policies (        -- 10.11 分级决策阈值（每 workspace 一行）
  workspace_id UUID PRIMARY KEY,
  policy JSONB NOT NULL,                -- {confidenceMin, historicalSuccessRateMin, recentManualOpsWindowHours, dailyCapCny}
  updated_by UUID, updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE report_runs (              -- 1.8 早报 / 3.10 定时推 的生成记录
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL, user_id UUID,
  kind TEXT NOT NULL,                   -- daily_brief|report_schedule
  ref JSONB,                            -- {date} | {subscription_id, view_id|report_config_id}
  status TEXT NOT NULL,                 -- pending_data|running|ready|failed
  data_as_of TIMESTAMPTZ, output_ref TEXT, error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ,
  UNIQUE (workspace_id, user_id, kind, ref)
);

ALTER TABLE report_configs ADD COLUMN is_shared BOOLEAN DEFAULT false;   -- 3.8
ALTER TABLE report_configs ADD COLUMN version TEXT DEFAULT 'report-config/v1';
ALTER TABLE report_configs ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

-- v1.5.1 新增（2026-09-05 深夜 arch；全量偏差审计后老板拍 A①-⑤；并入 migration 015，R-014）
-- =====================================================================
-- ① 账户池：库存态（老板 9-5 按原型 P09 定九态）与投放态并存；系统推导 + 人工可覆盖留痕
ALTER TABLE accounts ADD COLUMN pool_status TEXT NOT NULL DEFAULT 'available'
  CHECK (pool_status IN ('available','assigned','pending_open','pending_recharge','pending_build','in_delivery','paused','closed','abnormal'));
ALTER TABLE accounts ADD COLUMN pool_status_source TEXT NOT NULL DEFAULT 'system' CHECK (pool_status_source IN ('system','manual'));
ALTER TABLE accounts ADD COLUMN pool_status_overridden_by UUID;
ALTER TABLE accounts ADD COLUMN pool_status_changed_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN product_name TEXT;      -- 产品归属：个人空间人工/导入维护；团队空间同步 ka-data product_name/bound_by
ALTER TABLE accounts ADD COLUMN product_ref TEXT;
-- 推导规则（系统每日切+事件触发；manual 覆盖后系统不改，直到人工清除）：
--   closed_at→closed｜abnormal 规则命中→abnormal｜无有效 task_accounts→available｜有任务 & 无消耗 & 余额≤0→pending_recharge
--   有余额 & 无 unit→pending_build｜有任务 & 无消耗 & 有 unit→assigned｜有消耗→in_delivery（内再用 lifecycle_stage 细分）｜paused=所有 unit 暂停
--   pending_open 只由开户流程向导写入

CREATE TABLE changeset_groups (        -- ① 账户池勾选批量 → 一组变更集一次预览一次确认；执行仍逐账户（三键不变）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  initiator UUID NOT NULL, title TEXT, reason_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft',     -- draft|confirmed|executing|done（=全部终态）
  created_at TIMESTAMPTZ DEFAULT now(), confirmed_at TIMESTAMPTZ
);
ALTER TABLE changesets ADD COLUMN group_id UUID REFERENCES changeset_groups(id);

-- ② 投放任务：准备→投放阶段模型（REQ-028；原型 P03/P04）
ALTER TABLE tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'preparing'
  CHECK (stage IN ('preparing','opening','recharging','building','cold_start','delivering','ended'));
ALTER TABLE tasks ADD COLUMN stage_source TEXT NOT NULL DEFAULT 'system' CHECK (stage_source IN ('system','manual','workflow'));
ALTER TABLE tasks ADD COLUMN stage_changed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN sop_run_id UUID;           -- 绑定的「开户到基建」工作流 run（可空）
ALTER TABLE workflow_runs ADD COLUMN task_id TEXT;      -- run ↔ 任务（SOP 进度来源）
CREATE TABLE task_readiness_overrides (  -- 就绪度六段里"策略/商品"等无法系统推导的，人工勾
  workspace_id UUID NOT NULL, task_id TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('accounts','recharge','products','materials','strategy','infra')),
  ready BOOLEAN NOT NULL, note TEXT, marked_by UUID, marked_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, task_id, dimension),
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id)
);
-- stage 推导：无账户→preparing；有 pending_open 户→opening；有户全 pending_recharge→recharging；有户 pending_build→building；
--   首次消耗 3 日内→cold_start；之后→delivering；period_end 过→ended。workflow 触发（sop_run 节点完成）优先于系统推导；manual 最优先。

-- v1.7.1（2026-09-06；fe F-006-Q2）用户偏好，identity 级跨空间；进 migration 015（R-014）
CREATE TABLE identity_preferences (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE RESTRICT,
  preferences JSONB NOT NULL DEFAULT '{}',   -- {theme:{mode,hue}, locale}
  updated_at TIMESTAMPTZ DEFAULT now()
);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM accounts WHERE pool_status_source <> 'system') THEN
        RAISE EXCEPTION 'accounts carries manual pool_status overrides; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM accounts WHERE product_name IS NOT NULL OR product_ref IS NOT NULL) THEN
        RAISE EXCEPTION 'accounts carries product bindings; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM tasks WHERE stage_source <> 'system' OR sop_run_id IS NOT NULL) THEN
        RAISE EXCEPTION 'tasks carries manual or workflow stage sources; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM changesets WHERE group_id IS NOT NULL) THEN
        RAISE EXCEPTION 'changesets are linked to changeset groups; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM workflow_runs WHERE task_id IS NOT NULL) THEN
        RAISE EXCEPTION 'workflow_runs are linked to tasks; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM report_configs WHERE is_shared IS DISTINCT FROM false OR version IS DISTINCT FROM 'report-config/v1') THEN
        RAISE EXCEPTION 'report_configs carries shared or versioned rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM external_changes) THEN
        RAISE EXCEPTION 'external_changes still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM account_transfers) THEN
        RAISE EXCEPTION 'account_transfers still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM user_watchlists) THEN
        RAISE EXCEPTION 'user_watchlists still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM saved_views) THEN
        RAISE EXCEPTION 'saved_views still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM exports) THEN
        RAISE EXCEPTION 'exports still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM capabilities) THEN
        RAISE EXCEPTION 'capabilities still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM decision_policies) THEN
        RAISE EXCEPTION 'decision_policies still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM report_runs) THEN
        RAISE EXCEPTION 'report_runs still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM changeset_groups) THEN
        RAISE EXCEPTION 'changeset_groups still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM task_readiness_overrides) THEN
        RAISE EXCEPTION 'task_readiness_overrides still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM identity_preferences) THEN
        RAISE EXCEPTION 'identity_preferences still holds rows; cannot downgrade losslessly';
      END IF;
    END;
    $$;

    ALTER TABLE report_configs DROP COLUMN updated_at, DROP COLUMN version, DROP COLUMN is_shared;
    ALTER TABLE workflow_runs DROP COLUMN task_id;
    ALTER TABLE tasks DROP COLUMN sop_run_id, DROP COLUMN stage_changed_at, DROP COLUMN stage_source, DROP COLUMN stage;
    ALTER TABLE changesets DROP COLUMN group_id;
    ALTER TABLE accounts DROP COLUMN product_ref, DROP COLUMN product_name,
      DROP COLUMN pool_status_changed_at, DROP COLUMN pool_status_overridden_by,
      DROP COLUMN pool_status_source, DROP COLUMN pool_status;
    DROP TABLE identity_preferences;
    DROP TABLE task_readiness_overrides;
    DROP TABLE changeset_groups;
    DROP TABLE report_runs;
    DROP TABLE decision_policies;
    DROP TABLE capabilities;
    DROP TABLE exports;
    DROP TABLE saved_views;
    DROP TABLE user_watchlists;
    DROP TABLE account_transfers;
    DROP INDEX idx_external_changes_account;
    DROP TABLE external_changes;
  `);
};
