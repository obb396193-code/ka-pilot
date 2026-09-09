// P149 UNREGISTERED DRAFT: 014 base tables are absent. Do not deploy independently.
/* global exports */
// R-015 / be. Frozen v1.6 DDL copied directly from packages/contract/schema.sql.
// Generated slice is locked by exact statement parity tests; do not edit the authority here.
// Run before services start, or in a stopped-write maintenance window. No online-low-lock claim.
// Down locks and checks every affected table before any irreversible drop, without CASCADE.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
-- v1.6 新增（2026-09-06 arch；老板 9-5"契约全动了让前端全铺开"；素材/结算列由 arch 从 B12-B19 domain 反推冻结，不再等提案；Codex R-015 出 migration 016）
-- =====================================================================
-- 6.x 素材域列补齐（对齐 domain material-teardown/transcript/similarity/experiment/design-brief）
ALTER TABLE materials ADD COLUMN thumbnail_ref TEXT;
ALTER TABLE materials ADD COLUMN duration_ms INT;
ALTER TABLE materials ADD COLUMN width INT;
ALTER TABLE materials ADD COLUMN height INT;
ALTER TABLE materials ADD COLUMN content_sha256 TEXT;     -- 下载后持久指纹；URL 每次重签不缓存（OS 第五轮实证）
ALTER TABLE materials ADD COLUMN product_id TEXT;
ALTER TABLE materials ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE materials ADD COLUMN source_status TEXT NOT NULL DEFAULT 'unknown';   -- reachable|unreachable|unknown（视频源探针）
ALTER TABLE material_analyses ADD COLUMN transcript_source TEXT;        -- platform_caption|cloud_asr
ALTER TABLE material_analyses ADD COLUMN timing_precision TEXT;         -- segment|whole_video（IdeaLab 无时间戳=whole_video）
ALTER TABLE material_analyses ADD COLUMN visual_summary JSONB;          -- {hardCutCount, visualEventCount, averageShotLengthMs, hookVisualDensity}
ALTER TABLE material_analyses ADD COLUMN fingerprint TEXT;
ALTER TABLE material_analyses ADD COLUMN error TEXT;
CREATE TABLE material_replication_lineages (   -- 6.6 复刻谱系（B16）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL, media TEXT NOT NULL,
  source_material_id TEXT NOT NULL, derived_material_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('script_rewrite','structure_adaptation','visual_remake','mixed')),
  source_teardown_fingerprint TEXT, note TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, media, derived_material_id)
);
CREATE TABLE material_experiment_policies (    -- 6.7 样本护栏（B17）
  workspace_id UUID NOT NULL, policy_version TEXT NOT NULL,
  policy JSONB NOT NULL,   -- {minActiveDays,minAccounts,minExposure,minClicks,minRealConversions,minCost,minCpaImprovementRate,conversionRateDenominator}
  fingerprint TEXT, created_by UUID, created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, policy_version)
);
ALTER TABLE product_material_experiments ADD COLUMN policy_version TEXT;
ALTER TABLE product_material_experiments ADD COLUMN window_from DATE;
ALTER TABLE product_material_experiments ADD COLUMN window_to DATE;
ALTER TABLE material_briefs ADD COLUMN product_id TEXT;
ALTER TABLE material_briefs ADD COLUMN brief_version TEXT;
ALTER TABLE material_briefs ADD COLUMN deliveries JSONB;                -- [{variantKey, derivedMaterialId, lineageId, deliveredAt}]
ALTER TABLE material_briefs ADD COLUMN backtest_status TEXT;            -- awaiting_delivery|awaiting_sample|ready
ALTER TABLE material_briefs ADD COLUMN fingerprint TEXT;

-- 7.3 结算列补齐（对齐 domain settlement.ts）
ALTER TABLE settlement_templates ADD COLUMN template_id TEXT;
ALTER TABLE settlement_templates ADD COLUMN name TEXT;
ALTER TABLE settlement_templates ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'CNY';
ALTER TABLE settlement_templates ADD COLUMN unit_note TEXT;
ALTER TABLE settlement_templates ADD COLUMN checks JSONB;               -- [{checkKey,label,order,leftFieldKey,rightFieldKey,tolerance,severity}]
ALTER TABLE settlement_templates ADD COLUMN fingerprint TEXT;
ALTER TABLE settlement_templates ADD COLUMN created_by UUID;
-- fields JSONB = [{fieldKey,label,order,valueType:text|date|number|money|rate, aggregation:none|sum, source:{kind:fact,factKey}|{kind:formula,expression}, required, allowCorrection}]；formulas 列废弃（表达式在 fields.source）
ALTER TABLE settlements ADD COLUMN run_id TEXT;
ALTER TABLE settlements ADD COLUMN scope_id TEXT;                       -- 结算范围（优化师/任务/全部）
ALTER TABLE settlements ADD COLUMN data_basis TEXT NOT NULL DEFAULT 'offline_settlement';
ALTER TABLE settlements ADD COLUMN data_cutoff_at TIMESTAMPTZ;
ALTER TABLE settlements ADD COLUMN issues JSONB;                        -- [{code,severity,rowKey,fieldKey,checkKey}]
ALTER TABLE settlements ADD COLUMN preview_status TEXT;                 -- blocked|ready_to_freeze
ALTER TABLE settlements ADD COLUMN confirmed_by UUID;
ALTER TABLE settlements ADD COLUMN confirmed_at TIMESTAMPTZ;
ALTER TABLE settlements ADD COLUMN fingerprint TEXT;
ALTER TABLE settlement_lines ADD COLUMN row_key TEXT;
ALTER TABLE settlement_lines ADD COLUMN source_fact_id TEXT;
ALTER TABLE settlement_lines ADD COLUMN checks JSONB;                   -- [{checkKey,status:matched|mismatch|undefined,difference,relativeDifference,severity}]
CREATE TABLE settlement_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), settlement_id UUID NOT NULL REFERENCES settlements(id),
  row_key TEXT NOT NULL, field_key TEXT NOT NULL, from_value JSONB, to_value JSONB,
  reason TEXT NOT NULL, evidence_ref TEXT, corrected_by UUID NOT NULL, corrected_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (settlement_id, row_key, field_key)
);

-- 14.5/14.6/14.3a/灰度：治理后台最小
CREATE TABLE workspace_flags (
  workspace_id UUID PRIMARY KEY,
  flags JSONB NOT NULL DEFAULT '{}',   -- {write_enabled:false, agent_enabled:false, team_source_enabled:false, materials_enabled:false, dingtalk_enabled:false}
  updated_by UUID, updated_at TIMESTAMPTZ DEFAULT now()
);
-- 成员进出用现有 auth_identities/users/workspace_memberships/account_access_grants；停用=membership.is_active=false + 撤销该 identity 全部 session（不删行）

-- 4.7 开户测试跟踪（P1）
CREATE TABLE account_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  media TEXT NOT NULL, account_id TEXT NOT NULL, task_id TEXT,
  FOREIGN KEY (workspace_id, media, account_id) REFERENCES accounts(workspace_id, media, account_id),
  purpose TEXT NOT NULL,               -- 测什么：新任务/新版位/新出价/承接页…
  hypothesis TEXT, started_at DATE NOT NULL, end_at DATE,
  status TEXT NOT NULL DEFAULT 'planned',   -- planned|running|passed|failed|stopped
  verdict_note TEXT, result JSONB,     -- 系统只算窗口指标快照，结论由人填
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.8 优质户复制（P1；PRD 3.x 优质户复制流程 A）
CREATE TABLE account_replications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  source_media TEXT NOT NULL, source_account_id TEXT NOT NULL,
  target_media TEXT NOT NULL, target_account_id TEXT NOT NULL,
  include JSONB NOT NULL,              -- {structure, bids, schedule}
  changeset_group_id UUID REFERENCES changeset_groups(id),
  status TEXT NOT NULL DEFAULT 'draft',    -- draft|confirmed|applied|failed
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);
-- 目标户打标：accounts.tags 加 'replicated_from:<media>:<account_id>'；母子对比走 v3 summary 两次查询并排


-- =====================================================================

  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE account_replications, account_tests, material_analyses, material_briefs, material_experiment_policies, material_replication_lineages, materials, product_material_experiments, settlement_corrections, settlement_lines, settlement_templates, settlements, workspace_flags IN ACCESS EXCLUSIVE MODE;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM material_replication_lineages) THEN RAISE EXCEPTION '016 downgrade would lose material_replication_lineages rows'; END IF;
      IF EXISTS (SELECT 1 FROM material_experiment_policies) THEN RAISE EXCEPTION '016 downgrade would lose material_experiment_policies rows'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_corrections) THEN RAISE EXCEPTION '016 downgrade would lose settlement_corrections rows'; END IF;
      IF EXISTS (SELECT 1 FROM workspace_flags) THEN RAISE EXCEPTION '016 downgrade would lose workspace_flags rows'; END IF;
      IF EXISTS (SELECT 1 FROM account_tests) THEN RAISE EXCEPTION '016 downgrade would lose account_tests rows'; END IF;
      IF EXISTS (SELECT 1 FROM account_replications) THEN RAISE EXCEPTION '016 downgrade would lose account_replications rows'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE thumbnail_ref IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose materials.thumbnail_ref'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE duration_ms IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose materials.duration_ms'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE width IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose materials.width'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE height IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose materials.height'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE content_sha256 IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose materials.content_sha256'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE product_id IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose materials.product_id'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE tags IS DISTINCT FROM '{}'::text[]) THEN RAISE EXCEPTION '016 downgrade would lose materials.tags'; END IF;
      IF EXISTS (SELECT 1 FROM materials WHERE source_status IS DISTINCT FROM 'unknown') THEN RAISE EXCEPTION '016 downgrade would lose materials.source_status'; END IF;
      IF EXISTS (SELECT 1 FROM material_analyses WHERE transcript_source IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_analyses.transcript_source'; END IF;
      IF EXISTS (SELECT 1 FROM material_analyses WHERE timing_precision IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_analyses.timing_precision'; END IF;
      IF EXISTS (SELECT 1 FROM material_analyses WHERE visual_summary IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_analyses.visual_summary'; END IF;
      IF EXISTS (SELECT 1 FROM material_analyses WHERE fingerprint IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_analyses.fingerprint'; END IF;
      IF EXISTS (SELECT 1 FROM material_analyses WHERE error IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_analyses.error'; END IF;
      IF EXISTS (SELECT 1 FROM product_material_experiments WHERE policy_version IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose product_material_experiments.policy_version'; END IF;
      IF EXISTS (SELECT 1 FROM product_material_experiments WHERE window_from IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose product_material_experiments.window_from'; END IF;
      IF EXISTS (SELECT 1 FROM product_material_experiments WHERE window_to IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose product_material_experiments.window_to'; END IF;
      IF EXISTS (SELECT 1 FROM material_briefs WHERE product_id IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_briefs.product_id'; END IF;
      IF EXISTS (SELECT 1 FROM material_briefs WHERE brief_version IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_briefs.brief_version'; END IF;
      IF EXISTS (SELECT 1 FROM material_briefs WHERE deliveries IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_briefs.deliveries'; END IF;
      IF EXISTS (SELECT 1 FROM material_briefs WHERE backtest_status IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_briefs.backtest_status'; END IF;
      IF EXISTS (SELECT 1 FROM material_briefs WHERE fingerprint IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose material_briefs.fingerprint'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_templates WHERE template_id IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_templates.template_id'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_templates WHERE name IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_templates.name'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_templates WHERE currency_code IS DISTINCT FROM 'CNY') THEN RAISE EXCEPTION '016 downgrade would lose settlement_templates.currency_code'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_templates WHERE unit_note IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_templates.unit_note'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_templates WHERE checks IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_templates.checks'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_templates WHERE fingerprint IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_templates.fingerprint'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_templates WHERE created_by IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_templates.created_by'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE run_id IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.run_id'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE scope_id IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.scope_id'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE data_basis IS DISTINCT FROM 'offline_settlement') THEN RAISE EXCEPTION '016 downgrade would lose settlements.data_basis'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE data_cutoff_at IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.data_cutoff_at'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE issues IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.issues'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE preview_status IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.preview_status'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE confirmed_by IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.confirmed_by'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE confirmed_at IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.confirmed_at'; END IF;
      IF EXISTS (SELECT 1 FROM settlements WHERE fingerprint IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlements.fingerprint'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_lines WHERE row_key IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_lines.row_key'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_lines WHERE source_fact_id IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_lines.source_fact_id'; END IF;
      IF EXISTS (SELECT 1 FROM settlement_lines WHERE checks IS NOT NULL) THEN RAISE EXCEPTION '016 downgrade would lose settlement_lines.checks'; END IF;
    END;
    $$;
    DROP TABLE account_replications;
    DROP TABLE account_tests;
    DROP TABLE workspace_flags;
    DROP TABLE settlement_corrections;
    DROP TABLE material_experiment_policies;
    DROP TABLE material_replication_lineages;
    ALTER TABLE settlement_lines DROP COLUMN checks;
    ALTER TABLE settlement_lines DROP COLUMN source_fact_id;
    ALTER TABLE settlement_lines DROP COLUMN row_key;
    ALTER TABLE settlements DROP COLUMN fingerprint;
    ALTER TABLE settlements DROP COLUMN confirmed_at;
    ALTER TABLE settlements DROP COLUMN confirmed_by;
    ALTER TABLE settlements DROP COLUMN preview_status;
    ALTER TABLE settlements DROP COLUMN issues;
    ALTER TABLE settlements DROP COLUMN data_cutoff_at;
    ALTER TABLE settlements DROP COLUMN data_basis;
    ALTER TABLE settlements DROP COLUMN scope_id;
    ALTER TABLE settlements DROP COLUMN run_id;
    ALTER TABLE settlement_templates DROP COLUMN created_by;
    ALTER TABLE settlement_templates DROP COLUMN fingerprint;
    ALTER TABLE settlement_templates DROP COLUMN checks;
    ALTER TABLE settlement_templates DROP COLUMN unit_note;
    ALTER TABLE settlement_templates DROP COLUMN currency_code;
    ALTER TABLE settlement_templates DROP COLUMN name;
    ALTER TABLE settlement_templates DROP COLUMN template_id;
    ALTER TABLE material_briefs DROP COLUMN fingerprint;
    ALTER TABLE material_briefs DROP COLUMN backtest_status;
    ALTER TABLE material_briefs DROP COLUMN deliveries;
    ALTER TABLE material_briefs DROP COLUMN brief_version;
    ALTER TABLE material_briefs DROP COLUMN product_id;
    ALTER TABLE product_material_experiments DROP COLUMN window_to;
    ALTER TABLE product_material_experiments DROP COLUMN window_from;
    ALTER TABLE product_material_experiments DROP COLUMN policy_version;
    ALTER TABLE material_analyses DROP COLUMN error;
    ALTER TABLE material_analyses DROP COLUMN fingerprint;
    ALTER TABLE material_analyses DROP COLUMN visual_summary;
    ALTER TABLE material_analyses DROP COLUMN timing_precision;
    ALTER TABLE material_analyses DROP COLUMN transcript_source;
    ALTER TABLE materials DROP COLUMN source_status;
    ALTER TABLE materials DROP COLUMN tags;
    ALTER TABLE materials DROP COLUMN product_id;
    ALTER TABLE materials DROP COLUMN content_sha256;
    ALTER TABLE materials DROP COLUMN height;
    ALTER TABLE materials DROP COLUMN width;
    ALTER TABLE materials DROP COLUMN duration_ms;
    ALTER TABLE materials DROP COLUMN thumbnail_ref;
  `);
};
