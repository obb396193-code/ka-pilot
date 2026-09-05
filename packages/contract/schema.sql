-- 数据库契约 v1.2（B1a 迁移蓝本；PostgreSQL；与 PRD v1.6 §3.1 硬要求一致）
-- 纪律：所有业务表带 workspace_id；B 级功能不建表；改动走 arch。
-- v1.2（2026-09-04 arch 接回裁决）：P0-05 一账户日一任务区间排斥｜P0-07 workflow 单执行器+effect outbox｜
--   P0-12 钉钉 durable inbox｜P0-13 changeset 租户外键｜P0-03 backfill 完整 DAG 终态。迁移编号从 011 起（008-010 已被 B23 授权/调度/空间类型占用）。
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- P0-05 区间排斥约束依赖

-- ═══ 租户与身份 ═══
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'personal',   -- personal|team；team 一期只读
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT workspaces_kind_ck CHECK (kind IN ('personal', 'team')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  buc_id TEXT UNIQUE, name TEXT NOT NULL,
  qihang_user_id TEXT,                 -- 拉数身份
  multica_pat_ref TEXT,                -- Secret 服务 reference（绝不存明文）
  idealab_ak_ref TEXT,                 -- 同上
  role TEXT NOT NULL DEFAULT 'optimizer',   -- optimizer|operator|lead|admin
  is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, id)
);

-- 登录身份与业务用户解耦：一个自然人身份可加入多个 workspace；现有 users 继续作为
-- workspace 内的业务 actor，避免破坏 owner/initiator/credential_owner 等既有外键。
-- 正式 BUC 接入只新增/替换 provider adapter，不改 membership、session 或业务授权模型。
CREATE TABLE auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,              -- internal_test|buc
  provider_subject TEXT NOT NULL,      -- provider 内稳定 subject；不存密码/token
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject)
);
CREATE TABLE workspace_memberships (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,                  -- optimizer|operator|lead|admin
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, identity_id),
  UNIQUE (workspace_id, user_id),
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES users(workspace_id, id) ON DELETE RESTRICT
);
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES auth_identities(id) ON DELETE RESTRICT,
  active_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE,      -- 仅保存高熵 session token 的 hash，明文只存在 HttpOnly cookie
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (active_workspace_id, identity_id)
    REFERENCES workspace_memberships(workspace_id, identity_id) ON DELETE RESTRICT
);

-- ═══ 业务对象 ═══
-- P-001#3 裁决（全表通用）：外部 ID（task_id/account_id/entity_id/ad_id）在租户间不保证唯一，
-- 凡以外部 ID 为主键的表，主键一律为 (workspace_id, 外部ID...)；FK 一律带 workspace_id 同行引用。
CREATE TABLE tasks (
  task_id TEXT NOT NULL,               -- 奇航 task_id（B7 核验后若不准改自维护主键，字段结构不变）
  workspace_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, task_id),
  task_name TEXT, biz_name TEXT,
  rta_flag BOOLEAN, delivery_mode TEXT, placement_pref TEXT, conversion_metric TEXT,
  period_start DATE, period_end DATE, target_volume NUMERIC, budget NUMERIC,
  owner_user_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'active',        -- preparing|active|ended
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE assessment_price_history (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  task_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id),
  price NUMERIC NOT NULL, effective_date DATE NOT NULL,
  changed_by UUID, evidence_url TEXT,  -- 口径对齐台账：业务方确认凭证
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE channel_coefficients (    -- 返点折算系数，绝不硬编码
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  media TEXT NOT NULL, coefficient NUMERIC NOT NULL,
  effective_date DATE NOT NULL, changed_by UUID
);
CREATE TABLE accounts (
  account_id TEXT NOT NULL, workspace_id UUID NOT NULL,
  account_name TEXT, media TEXT NOT NULL,
  PRIMARY KEY (workspace_id, media, account_id),
  owner_user_id UUID REFERENCES users(id),
  lifecycle_stage TEXT DEFAULT 'unknown',  -- cold_start|ramping|stable|declining|paused|closed
  is_starred BOOLEAN DEFAULT false, tags TEXT[],
  status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE account_access_grants (
  workspace_id UUID NOT NULL,
  identity_id UUID NOT NULL,
  media TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'read', -- read|preview|execute；execute 仍受确认门约束
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, identity_id, media, account_id),
  FOREIGN KEY (workspace_id, identity_id)
    REFERENCES workspace_memberships(workspace_id, identity_id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT
);
CREATE TABLE task_accounts (           -- 关系表：历史/多任务（替代单值 task_id）
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  task_id TEXT NOT NULL, media TEXT NOT NULL, account_id TEXT NOT NULL,
  valid_from DATE NOT NULL, valid_to DATE,
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  UNIQUE(workspace_id, task_id, media, account_id, valid_from),
  -- P0-05 裁决（老板 2026-09-04）：一个账户同一业务日只归属一个任务；区间重叠写入直接拒绝（API 409 TASK_ACCOUNT_OVERLAP），不做分摊
  EXCLUDE USING gist (
    workspace_id WITH =, media WITH =, account_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  )
);

-- ═══ 指标（raw / canonical 分离，防 source 双计）═══
CREATE TABLE metrics_raw (             -- 接口原样落库，按 ds 分区
  id BIGSERIAL, workspace_id UUID NOT NULL,
  media TEXT NOT NULL, account_id TEXT NOT NULL, ds DATE NOT NULL,
  resource TEXT NOT NULL,              -- P-001#4 裁决：account|account_offline|account_realtime|ad_realtime（接口资源，回放依据）
  source TEXT NOT NULL,                -- realtime|offline（数据口径，与 resource 正交）
  request_params JSONB,                -- 该次调用参数（hh/日期范围等），保证可重放
  payload JSONB NOT NULL,              -- 接口原始行
  fetched_by_user UUID, fetched_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  PRIMARY KEY (id, ds)
) PARTITION BY RANGE (ds);
CREATE INDEX idx_metrics_raw_replay ON metrics_raw(workspace_id, media, account_id, ds, resource);
CREATE TABLE account_metrics_daily (   -- canonical：一户一日一行
  workspace_id UUID NOT NULL,
  media TEXT NOT NULL, account_id TEXT NOT NULL, ds DATE NOT NULL,
  cost NUMERIC, exposure BIGINT, click BIGINT,
  conversion BIGINT, real_conversion BIGINT,
  real_cpa NUMERIC, cash_cost NUMERIC, cash_cpa NUMERIC, cost_space NUMERIC, gap NUMERIC,
  budget NUMERIC, budget_usage_rate NUMERIC, deduction_rate NUMERIC,
  main_ad_cost_proportion NUMERIC, assessment_price_snapshot NUMERIC,
  wake_uv BIGINT, potential_uv BIGINT,
  field_sources JSONB,                 -- 每字段来源（offline/realtime/gap_filled）
  data_anomaly BOOLEAN DEFAULT false,
  computed_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  PRIMARY KEY (workspace_id, media, account_id, ds)
) PARTITION BY RANGE (ds);
CREATE TABLE ad_metrics_hourly (       -- 小时级（保留 90 天→日级 rollup）
  workspace_id UUID NOT NULL,
  media TEXT NOT NULL, ad_id TEXT NOT NULL, account_id TEXT NOT NULL, ds DATE NOT NULL, hh SMALLINT NOT NULL,
  cost NUMERIC, exposure BIGINT, click BIGINT, conversion BIGINT, real_conversion BIGINT,
  bid NUMERIC, budget NUMERIC,
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  PRIMARY KEY (workspace_id, ad_id, ds, hh)    -- P-001#3 裁决：同上
) PARTITION BY RANGE (ds);
CREATE TABLE ad_entities (             -- 账户结构（经 agent 同步，强类型层级）
  entity_id TEXT NOT NULL, workspace_id UUID NOT NULL,
  media TEXT NOT NULL, account_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,           -- campaign|unit|creative
  parent_id TEXT, name TEXT, status TEXT, put_status TEXT,
  bid NUMERIC, cpa_bid NUMERIC, day_budget NUMERIC, schedule_time TEXT,  -- 168位串
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  synced_at TIMESTAMPTZ, PRIMARY KEY (workspace_id, entity_id, entity_type)
);
CREATE TABLE account_balance (
  account_id TEXT NOT NULL, media TEXT NOT NULL, workspace_id UUID NOT NULL,
  PRIMARY KEY (workspace_id, media, account_id),
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  balance NUMERIC, recharge_balance NUMERIC,
  contract_rebate NUMERIC, direct_rebate NUMERIC, synced_at TIMESTAMPTZ
);

-- ═══ 工作项与执行 ═══
CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  type TEXT NOT NULL,                  -- diagnosis|dispatch|self|agent_question|external_handled
  media TEXT, account_id TEXT, task_id TEXT, rule_id BIGINT,
  CHECK ((account_id IS NULL) = (media IS NULL)),
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  severity TEXT,                       -- P0|P1|P2|opportunity
  title TEXT NOT NULL,
  evidence_snapshot JSONB,             -- 证据快照（带 snapshot_at）
  diagnosis JSONB,                     -- agent 诊断 JSON（原因子类/置信度/建议）
  status TEXT DEFAULT 'open',          -- open|processing|done|ignored|expired|external_handled|rejected|escalated
  ignore_reason TEXT, muted_until DATE,
  assignee UUID, creator UUID, acceptance_criteria TEXT, sla_due TIMESTAMPTZ,
  reject_reason TEXT,
  t1_result JSONB, created_at TIMESTAMPTZ DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE TABLE changesets (              -- header
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  work_item_id UUID, media TEXT, account_id TEXT, title TEXT,
  CHECK ((account_id IS NULL) = (media IS NULL)),
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  status TEXT DEFAULT 'draft',         -- draft|confirmed|sent|executing|success|partial|failed|unknown|expired|rolled_back
  initiator UUID NOT NULL,
  credential_owner_user_id UUID NOT NULL,   -- 后台归属闭环：重试永远用此凭证
  -- P0-13 裁决：发起人与凭证主体必须是同 workspace 的 active user，由外键兜底；服务端创建/确认/执行前再校验 is_active
  FOREIGN KEY (workspace_id, initiator) REFERENCES users(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, credential_owner_user_id) REFERENCES users(workspace_id, id) ON DELETE RESTRICT,
  executor_identity TEXT,              -- 沙箱执行身份（审计双记录）
  approval_id UUID,                    -- 提审（自愿）关联，可空
  multica_issue_id TEXT,
  ttl_expire_at TIMESTAMPTZ, reason_code TEXT,   -- 操作原因码（3秒打标）
  simulation JSONB,                    -- What-if：区间/置信度/假设
  created_at TIMESTAMPTZ DEFAULT now(), executed_at TIMESTAMPTZ
);
-- P-001#2 裁决：直接被查询/被列表化的表必须自带 workspace_id（下列已补）；
-- 纯明细子表（changeset_items/execution_runs/workflow_run_events/agent_messages/agent_context_items）
-- 允许经父表间接隔离，但查询必须 JOIN 父表带上 workspace_id 条件，不得裸查。
CREATE TABLE changeset_items (         -- 明细（批量/部分成功）
  id BIGSERIAL PRIMARY KEY, changeset_id UUID NOT NULL REFERENCES changesets(id),
  workspace_id UUID NOT NULL, media TEXT NOT NULL, account_id TEXT NOT NULL,   -- P0-13 裁决：每条明细自带账户三键，同账户写冲突锁与权限校验依此
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL,           -- account|campaign|unit|creative
  target_id TEXT NOT NULL, field TEXT NOT NULL,
  from_value TEXT, to_value TEXT,
  item_status TEXT DEFAULT 'pending',  -- pending|success|failed
  fail_reason TEXT
);
CREATE TABLE execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), changeset_id UUID NOT NULL,
  attempt INT DEFAULT 1, status TEXT, dry_run BOOLEAN DEFAULT false,
  request_payload JSONB, result_payload JSONB,
  started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
);

-- ═══ 规则与自动化 ═══
CREATE TABLE alert_rules (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  owner UUID,                          -- null=系统默认包
  fork_from BIGINT, name TEXT NOT NULL,
  rule_type TEXT, metric TEXT, operator TEXT, threshold NUMERIC,
  duration_hours INT, severity TEXT, scope JSONB,
  action TEXT DEFAULT 'work_item',     -- work_item|prefill_changeset|notify|auto_execute
  autonomy_level SMALLINT DEFAULT 1,   -- 1建议|2确认后执行|3自动（准确率解锁）
  enabled BOOLEAN DEFAULT true, muted_until DATE
);
CREATE TABLE workflow_definitions (    -- 单一数据模型：模板=发布态
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  name TEXT NOT NULL, owner UUID,
  asset_type TEXT DEFAULT 'personal',  -- personal|team|official_template
  copied_from UUID, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE workflow_versions (       -- 版本列表页查 → 自带 workspace_id
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  definition_id UUID NOT NULL REFERENCES workflow_definitions(id),
  version INT NOT NULL, graph JSONB NOT NULL,    -- nodes+edges（React Flow 兼容）
  params_schema JSONB, status TEXT DEFAULT 'draft',  -- draft|published
  published_at TIMESTAMPTZ, UNIQUE(definition_id, version)
);
CREATE TABLE workflow_runs (          -- 运行监控页列 → 自带 workspace_id
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  version_id UUID NOT NULL,            -- 运行固定版本
  initiator UUID, credential_owner_user_id UUID,
  status TEXT, params JSONB,
  executor_token UUID,                 -- P0-07 裁决：单执行者 fencing；推进 run 必须携带当前 token，续租/完成/失败均校验
  executor_lease_until TIMESTAMPTZ,    -- 过期后其他 Worker 才能接管并换新 token
  started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE TABLE workflow_run_events (    -- 日志纯子表，经 run JOIN
  id BIGSERIAL PRIMARY KEY, run_id UUID NOT NULL,
  node_id TEXT, event TEXT, detail JSONB, at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE workflow_effects (       -- P0-07 裁决：真实副作用 outbox；写节点先插本表（UNIQUE 冲突=已执行过，直接读结果不重放）
  id BIGSERIAL PRIMARY KEY, run_id UUID NOT NULL REFERENCES workflow_runs(id),
  node_id TEXT NOT NULL, attempt INT NOT NULL, phase TEXT NOT NULL,   -- phase: preview|execute|reconcile
  effect_key TEXT NOT NULL,            -- 幂等键（如 changeset_id / 外部请求 id）
  status TEXT DEFAULT 'pending',       -- pending|done|failed|unknown
  result JSONB, created_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ,
  UNIQUE (run_id, node_id, attempt, phase)
);

-- ═══ 任务队列（三应用协作核心）═══
CREATE TABLE jobs (                    -- job/outbox：Worker 消费，DB lease 单实例
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID,
  job_type TEXT NOT NULL,              -- etl_full|etl_incr|backfill|rule_scan|t1_recycle|struct_sync|agent_task|push|...
  payload JSONB, priority SMALLINT DEFAULT 5,
  credential_owner_user_id UUID,       -- **P-003 裁决（凭证归属三规则）**：
                                       -- (1) 用户操作直接触发的 job（changeset confirm/backfill/agent query）→ 操作人 user_id
                                       -- (2) 系统定时/规则自动触发且有账户归属（etl/rule_scan）→ 账户 owner_user_id（从 accounts.owner_user_id 取）
                                       -- (3) 纯系统任务无账户归属（全局 rule_scan/data_quality_check）→ NULL（Worker 用服务账号只读凭证，demo 期老板 PAT/正式期 mcn_ 身份）
                                       -- 重试永远用原 job 的此凭证，不换人
  status TEXT DEFAULT 'queued',        -- queued|leased|running|done|failed|blocked_auth
  lease_until TIMESTAMPTZ, lease_token UUID, -- 每次领取重生成；所有状态迁移用其 fencing
  attempts INT DEFAULT 0, max_attempts INT DEFAULT 3,
  last_error TEXT, run_after TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE INDEX idx_jobs_poll ON jobs(status, run_after, priority);
CREATE TABLE etl_runs (                -- 运行监控页直接列表化 → 自带 workspace_id
  id BIGSERIAL PRIMARY KEY, workspace_id UUID, job_id UUID, run_kind TEXT,
  scope JSONB, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  status TEXT, rows_ingested INT, step_failed TEXT, error_summary TEXT
);
CREATE TABLE backfill_jobs (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID, user_id UUID, date_from DATE, date_to DATE,
  cursor_date DATE,
  status TEXT DEFAULT 'running',       -- P0-03 裁决：running|raw_done|canonical_done|done|failed；
                                       -- done 只在 raw+canonical+quality 三阶段对全部日期都终态后置，任一阶段失败=failed 并留 failed_stage
  failed_stage TEXT,                   -- raw|canonical|quality
  created_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE TABLE data_quality_checks (     -- 每日对平自检（数据健康页读）
  id BIGSERIAL PRIMARY KEY, workspace_id UUID, ds DATE, check_type TEXT,
  sample JSONB, passed BOOLEAN, delta JSONB, checked_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 值守与日历 ═══
CREATE TABLE duty_roster (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  duty_date DATE NOT NULL, primary_user UUID NOT NULL, backup_user UUID
);
CREATE TABLE business_calendar (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  event_date DATE NOT NULL, event_type TEXT,    -- holiday|promo|coefficient_change|metric_change
  label TEXT, affects_baseline BOOLEAN DEFAULT true, threshold_profile TEXT
);

-- ═══ Multica / 基建 ═══
CREATE TABLE multica_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  account_id TEXT, multica_issue_id TEXT, is_primary BOOLEAN DEFAULT false,
  bound_by UUID, status TEXT DEFAULT 'active', last_synced_at TIMESTAMPTZ
);
CREATE TABLE infra_requests (          -- 结构化基建指令
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  account_id TEXT NOT NULL, thread_id UUID,
  params JSONB NOT NULL, template_version TEXT, compiled_prompt TEXT,
  status TEXT DEFAULT 'draft',         -- draft|generated_unsent|queued|sent|executing|awaiting_confirm|success|partial|failed|unknown|cancelled
  initiator UUID, credential_owner_user_id UUID,
  result JSONB, item_results JSONB,    -- 部分成功逐对象清单
  scheduled BOOLEAN DEFAULT false, schedule_cron TEXT, daily_cap INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ Agent ═══
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  user_id UUID NOT NULL, page_context JSONB, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE agent_messages (
  id BIGSERIAL PRIMARY KEY, session_id UUID NOT NULL,
  role TEXT, content JSONB, at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE agent_context_items (
  id BIGSERIAL PRIMARY KEY, session_id UUID NOT NULL,
  object_type TEXT, object_id TEXT, added_by TEXT   -- user_select|page|filter
);
CREATE TABLE agent_memory (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  scope TEXT NOT NULL,                 -- user|task|account
  scope_id TEXT NOT NULL, content TEXT NOT NULL,
  expire_at DATE,                      -- 口头规矩有效期
  created_by UUID, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE agent_runs (              -- 用户可见 Run 监控
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  kind TEXT, initiator UUID, status TEXT,
  summary TEXT, raw_log_ref TEXT,      -- 受限原始日志引用
  started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ
);

-- ═══ 集成与通知 ═══
CREATE TABLE integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  provider TEXT DEFAULT 'dingtalk', config JSONB,   -- client_id 等；secret 走 ref
  health TEXT, last_checked_at TIMESTAMPTZ
);
CREATE TABLE identity_mappings (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  provider TEXT, external_id TEXT, user_id UUID, UNIQUE(provider, external_id)
);
CREATE TABLE subscriptions (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  user_id UUID, kind TEXT,             -- daily_report|alert|settlement|run_result|report_schedule
  target TEXT,                         -- group|dm
  config JSONB, quiet_hours JSONB, enabled BOOLEAN DEFAULT true
);
CREATE TABLE outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID,
  channel TEXT, target TEXT, kind TEXT, payload JSONB,
  status TEXT DEFAULT 'queued', attempts INT DEFAULT 0, fail_reason TEXT,
  sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE inbound_events (         -- 回调监控页查 → 自带 workspace_id
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID,
  provider TEXT, external_event_id TEXT UNIQUE,   -- 回调幂等
  kind TEXT, payload JSONB, processed BOOLEAN DEFAULT false,
  -- P0-12 裁决（durable inbox）：网关收到消息必须**先 INSERT 本表成功再向钉钉 ACK**；处理走 lease 领取，
  -- 失败不删行、attempts+1 留 last_error，超过 max_attempts 进 dead；processed=false 且 lease 过期的行可被重领
  -- dead 的定义（2026-09-05 arch 按 P-043 实现冻结，不加 status 列）：processed=false AND attempts>=max_attempts AND last_error='ATTEMPTS_EXHAUSTED'；行永久保留作证据
  -- 本表消费按 kind 分：robot_message 由钉钉网关 inbox worker 领取；card 回调走 v1.4 card_callbacks（各自消费者，不混领）
  lease_until TIMESTAMPTZ, attempts INT DEFAULT 0, max_attempts INT DEFAULT 5,
  last_error TEXT, processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 报表与资产 ═══
CREATE TABLE report_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  owner UUID, name TEXT, config JSONB, schedule TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE assets (                  -- 统一资产（报表/工作流/策略/对象组）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  asset_kind TEXT NOT NULL,            -- report|workflow|strategy|object_group|knowledge
  ref_id UUID NOT NULL, owner UUID,
  status TEXT DEFAULT 'draft',         -- draft|shared|verified|official|deprecated（UI 起步只露 draft/shared）
  version INT DEFAULT 1, scope TEXT, dependencies JSONB,
  verified_at TIMESTAMPTZ, success_rate NUMERIC, usage_count INT DEFAULT 0,
  superseded_by UUID
);

-- ═══ 审计 ═══
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, workspace_id UUID,
  user_id UUID, action TEXT NOT NULL, object_type TEXT, object_id TEXT,
  detail JSONB, at TIMESTAMPTZ DEFAULT now()
);
-- 铁律：个人行为统计（处理条数/响应时长）永不做成可导出报表；audit 仅安全回溯。

-- ═══ 知识库（B8 建，此处仅预留名）═══
-- kb_documents 见 PRD 3.11，B8 批次建表（B 级不提前建）

-- ═══════════════════════════════════════════════════════════════════
-- v1.3 新增（2026-09-04 arch 裁决 P-005～P-008；Codex R-010 出 migration 012）
-- ═══════════════════════════════════════════════════════════════════

-- P-005#1 复合规则（版本化条件树；旧 metric/operator/threshold 三列保留兼容简单规则）
ALTER TABLE alert_rules ADD COLUMN condition_tree JSONB;   -- {version, all:[], any:[], not:[]}；叶子 {metric,operator,threshold,window_hours?}
ALTER TABLE alert_rules ADD COLUMN fallback_copy TEXT;     -- 条件树无法解释时的人话兜底

-- P-005#2 工作项去重与复发
ALTER TABLE work_items ADD COLUMN dedupe_key TEXT;         -- rule_id:media:account_id
ALTER TABLE work_items ADD COLUMN occurrence_count INT DEFAULT 1;
ALTER TABLE work_items ADD COLUMN last_triggered_at TIMESTAMPTZ;
CREATE UNIQUE INDEX uq_work_items_active_dedupe ON work_items(workspace_id, dedupe_key)
  WHERE status IN ('open','processing','dispatched');       -- 同 key 活动态只一条；严重度升级=关旧建新
-- P-005#3 状态机补 dispatched 态：open|processing|dispatched|escalated|rejected|done|ignored|expired|external_handled

-- P-005#4 户级静音（P0 突破静音；work_items.muted_until 废弃）
CREATE TABLE account_mutes (
  workspace_id UUID NOT NULL, media TEXT NOT NULL, account_id TEXT NOT NULL,
  muted_until DATE NOT NULL, muted_by UUID, reason_chip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, media, account_id),
  FOREIGN KEY (workspace_id, media, account_id) REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT
);

-- P-005#6 0 曝光规则需要计划创建时间
ALTER TABLE ad_entities ADD COLUMN created_at TIMESTAMPTZ;

-- P-006#2 typed value：from_value/to_value 改 JSONB {type:"number"|"boolean"|"string"|"json"|"schedule168", value, media_default?:true}
ALTER TABLE changeset_items ALTER COLUMN from_value TYPE JSONB USING to_jsonb(from_value);
ALTER TABLE changeset_items ALTER COLUMN to_value   TYPE JSONB USING to_jsonb(to_value);
-- P-006#5 hash
ALTER TABLE changesets ADD COLUMN dry_run_hash TEXT;      -- sha256(canonical_json(sorted items) + ttl_expire_at)；confirm 必须匹配
ALTER TABLE changesets ADD COLUMN confirm_hash TEXT;
-- P-006#4 execution_runs.status 枚举：pending|running|success|partial|failed|unknown|cancelled

-- P-008#1 Agent 会话约束
ALTER TABLE agent_messages ADD COLUMN seq INT;
ALTER TABLE agent_messages ADD COLUMN client_message_id TEXT;
ALTER TABLE agent_messages ADD CONSTRAINT fk_agent_messages_session FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX uq_agent_messages_seq ON agent_messages(session_id, seq);
CREATE UNIQUE INDEX uq_agent_messages_client ON agent_messages(session_id, client_message_id) WHERE client_message_id IS NOT NULL;
ALTER TABLE agent_context_items ADD CONSTRAINT fk_agent_ctx_session FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;
-- agent_context_items.object_type 枚举：account|task|work_item|changeset|report

-- P-008#2 runs 补列；status 枚举 queued|running|succeeded|failed|cancelled|timeout
ALTER TABLE agent_runs ADD COLUMN session_id UUID REFERENCES agent_sessions(id);
ALTER TABLE agent_runs ADD COLUMN provider_id TEXT;
ALTER TABLE agent_runs ADD COLUMN model TEXT;
ALTER TABLE agent_runs ADD COLUMN credential_owner_user_id UUID;
ALTER TABLE agent_runs ADD COLUMN error_code TEXT;
ALTER TABLE agent_runs ADD COLUMN attempt INT DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN first_token_at TIMESTAMPTZ;
ALTER TABLE agent_runs ADD COLUMN usage_ref TEXT;
ALTER TABLE agent_runs ADD COLUMN result_ref TEXT;

-- P-008#3 run 事件（流式恢复/审计；raw 走对象存储只存 ref）
CREATE TABLE agent_run_events (
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq INT NOT NULL, kind TEXT NOT NULL,   -- session|run|delta|tool|evidence|done|error
  safe_payload JSONB, raw_ref TEXT, at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

-- P-008#4 通用 Provider 凭证（users.idealab_ak_ref 迁移后废弃）
CREATE TABLE model_provider_credentials (
  workspace_id UUID NOT NULL, user_id UUID NOT NULL, provider_id TEXT NOT NULL,
  secret_ref TEXT NOT NULL,              -- 只存 reference
  status TEXT DEFAULT 'unverified',      -- unverified|active|invalid|revoked
  last_checked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, provider_id),
  FOREIGN KEY (workspace_id, user_id) REFERENCES users(workspace_id, id) ON DELETE RESTRICT
);

-- P-008#5 Provider Capability Matrix（实测通过才 status=verified）
CREATE TABLE provider_model_capabilities (
  provider_id TEXT NOT NULL, model TEXT NOT NULL,
  protocol TEXT NOT NULL,                -- anthropic_messages|openai_chat_completions
  supports_tools BOOLEAN, supports_stream BOOLEAN, supports_structured BOOLEAN,
  timeout_ms INT, sdk_compat TEXT,       -- native|adapter|unsupported
  status TEXT DEFAULT 'documented_unverified',   -- documented_unverified|verified|failed|disabled
  tested_at TIMESTAMPTZ, error_summary TEXT, test_version TEXT,
  PRIMARY KEY (provider_id, model)
);

-- ═══════════════════════════════════════════════════════════════════
-- v1.4 新增（2026-09-04 arch；契约缺口地图 12 条"待契约补"；Codex R-012 出 migration 014）
-- 编号：011=v1.2 ｜ 012=v1.3 ｜ 013=Task6 团队数据（R-011）｜ 014=v1.4
-- ═══════════════════════════════════════════════════════════════════

-- ── 1.6 警报流 / 9.5 值守升级链（PRD 3.5：P0 30min 未确认升级、P1 次日催办 48h、P2 攒批）
CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  work_item_id UUID NOT NULL REFERENCES work_items(id),
  level SMALLINT NOT NULL DEFAULT 1,      -- 1=值班主→备 ｜ 2=上级
  from_user UUID, to_user UUID NOT NULL,
  reason TEXT NOT NULL,                   -- ack_timeout|sla_breach|manual
  paused_until TIMESTAMPTZ,               -- 标"处理中"可暂停倒计时
  created_at TIMESTAMPTZ DEFAULT now(), acked_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ
);
CREATE TABLE escalation_policies (        -- 默认三行由 migration 014 seed：P0/P1/P2
  workspace_id UUID NOT NULL, severity TEXT NOT NULL,   -- P0|P1|P2
  ack_timeout_min INT, remind_after_h INT,
  escalate_to TEXT NOT NULL,              -- duty_backup|lead
  breaks_quiet_hours BOOLEAN DEFAULT false, batch_hourly BOOLEAN DEFAULT false,
  PRIMARY KEY (workspace_id, severity)
);

-- ── 1.9 / 3.10 协作：派发 + 主动提审（PRD 3.10 已给列，此处冻结）
CREATE TABLE dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  work_item_id UUID NOT NULL REFERENCES work_items(id),
  from_user UUID NOT NULL, to_user UUID NOT NULL,
  acceptance_criteria TEXT,
  acceptance_rule JSONB,                  -- {metric, operator, threshold, window_days}：T+1 自动判定关闭
  status TEXT DEFAULT 'open',             -- open|done|ignored|disagreed|escalated
  receipt TEXT, reject_reason TEXT, sla_due TIMESTAMPTZ,
  evidence_snapshot JSONB,                -- 派发时数据证据快照
  created_at TIMESTAMPTZ DEFAULT now(), closed_at TIMESTAMPTZ,
  FOREIGN KEY (workspace_id, from_user) REFERENCES users(workspace_id, id),
  FOREIGN KEY (workspace_id, to_user) REFERENCES users(workspace_id, id)
);
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  changeset_id UUID NOT NULL REFERENCES changesets(id),
  requester UUID NOT NULL, approver UUID NOT NULL,
  status TEXT DEFAULT 'pending',          -- pending|approved|rejected|expired|auto_passed
  comment TEXT, sla_due TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), decided_at TIMESTAMPTZ,
  FOREIGN KEY (workspace_id, requester) REFERENCES users(workspace_id, id),
  FOREIGN KEY (workspace_id, approver) REFERENCES users(workspace_id, id)
);
CREATE TABLE approval_auto_pass_rules (   -- 同类批过 3 次可免审（PRD 3.10）
  workspace_id UUID NOT NULL, approver UUID NOT NULL, kind TEXT NOT NULL,   -- kind=changeset reason_code
  approved_count INT DEFAULT 0, auto_pass BOOLEAN DEFAULT false, updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, approver, kind)
);
-- 充值协作（REQ-046）不入 approvals：只发 outbound_messages(kind='recharge_request')

-- ── 3.3 8 维度透视缺失 5 维的数据源（列先冻结；ad 级字段名待 OS agent 联调确认 ad_realtime payload）
ALTER TABLE accounts ADD COLUMN agent_type TEXT;         -- agency|self；来源=ka-data custom_tags["代投/自投"]（账户级、稀疏，"无匹配"→NULL；OS 2026-09-05 实证 ad 级无此维）
ALTER TABLE accounts ADD COLUMN is_ubp BOOLEAN;          -- OS 2026-09-05 实证：**全源无 UBP 字段**；列保留但 ubp 维度永久 DIMENSION_UNSUPPORTED 直到有源
ALTER TABLE ad_entities ADD COLUMN resource_position TEXT; -- 直取 ka-data dwd_adgroup_daily.resource_position（INVENTORY_UNIVERSAL|KUAI_SHOU_YOU_XUAN|KUAI_SHOU_LIAN_MENG|OPEN_SCREEN|ENCOURAGE_VIDEO…）或 MAPI unit scene_id
ALTER TABLE ad_entities ADD COLUMN bid_tool TEXT;        -- 派生枚举：ka-data bid_tool 列全空，由 MAPI unit bid_type+ocpx_action_type(+unit_type) 映射，映射表 R-012 从 ka-src-0007 提案
-- deduction_range 不落列：domain 按 deduction_rate 分桶 [0,10%)|[10,30%)|[30%,+)

-- ── 4.5 加/关账户
ALTER TABLE accounts ADD COLUMN claimed_by UUID;
ALTER TABLE accounts ADD COLUMN claimed_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN closed_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN close_reason TEXT;
-- 关户 = status→'closed' + lifecycle_stage→'closed'；关联清理向导见 api.md

-- ── 2.8 漏斗 / 2.9 任务时间线：不新增表（漏斗读 account_metrics_daily 聚合；时间线 UNION 五源见 api.md）

-- ── 6.x 素材域（表名/主键冻结；**列由 Codex R-012 从 B12-B18 已有 domain 类型提契约提案**，arch 审后补入本文件）
CREATE TABLE materials (
  workspace_id UUID NOT NULL, media TEXT NOT NULL, material_id TEXT NOT NULL,
  name TEXT, material_type TEXT,          -- video|image
  url_ref TEXT, source TEXT,              -- qihang_pool|upload|internal
  lineage_parent_id TEXT,                 -- 6.6 复刻自
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, media, material_id)
);
CREATE TABLE material_metrics_daily (
  workspace_id UUID NOT NULL, media TEXT NOT NULL, material_id TEXT NOT NULL, ds DATE NOT NULL,
  cost NUMERIC, exposure BIGINT, click BIGINT, conversion BIGINT, real_conversion BIGINT,
  account_count INT, field_sources JSONB,
  PRIMARY KEY (workspace_id, media, material_id, ds)
) PARTITION BY RANGE (ds);
CREATE TABLE material_analyses (         -- 6.3 拆片结果（B13-B15）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  media TEXT NOT NULL, material_id TEXT NOT NULL, version INT NOT NULL,
  prompt_version TEXT, status TEXT,       -- queued|running|done|failed
  transcript_ref TEXT, frames_ref TEXT,   -- ASR 文稿 / 关键帧墙（对象存储 ref）
  structure JSONB, evidence JSONB,        -- 钩子/卖点/人群/节奏/CTA + 时间戳证据
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, media, material_id, version)
);
CREATE TABLE material_similarity (       -- 6.3 相似（B16）
  workspace_id UUID NOT NULL, media TEXT NOT NULL, material_id TEXT NOT NULL, similar_material_id TEXT NOT NULL,
  score NUMERIC, components JSONB, computed_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, media, material_id, similar_material_id)
);
CREATE TABLE products (                  -- 6.2
  workspace_id UUID NOT NULL, product_id TEXT NOT NULL,
  name TEXT, status TEXT, attrs JSONB, created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, product_id)
);
CREATE TABLE product_material_experiments (   -- 6.7（B17）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  product_id TEXT NOT NULL, media TEXT NOT NULL, material_id TEXT NOT NULL,
  sample_policy JSONB, result JSONB, significance JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE material_briefs (          -- 6.5（B18）
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  media TEXT NOT NULL, source_material_id TEXT NOT NULL,
  brief JSONB, status TEXT,              -- draft|sent|backtest_pending|backtested
  designer_ref TEXT, backtest_material_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 7.3 结算对账（表名冻结；**列/公式由 Codex R-012 从 B19 提案**）
CREATE TABLE settlement_templates (
  workspace_id UUID NOT NULL, version TEXT NOT NULL,
  fields JSONB NOT NULL, formulas JSONB, tolerances JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, version)
);
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  period TEXT NOT NULL,                   -- YYYY-MM
  template_version TEXT NOT NULL,
  status TEXT DEFAULT 'draft',            -- draft|frozen
  snapshot JSONB, totals JSONB, created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(), frozen_at TIMESTAMPTZ,
  UNIQUE (workspace_id, period, template_version)   -- 模板版本化不覆盖旧单
);
CREATE TABLE settlement_lines (
  id BIGSERIAL PRIMARY KEY, settlement_id UUID NOT NULL REFERENCES settlements(id),
  media TEXT, account_id TEXT, task_id TEXT,
  fields JSONB NOT NULL, diff JSONB,     -- 返点实际 vs 估算差异
  work_item_id UUID                       -- 差异转工作项
);

-- ── 8.x 知识库（对齐 CR knowledge_items/document_links 命名 + B8 领域底座；前端复制 CR 代码时字段直接对上）
CREATE TABLE kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual',    -- manual|ai_report|case|sop
  parent_id UUID REFERENCES kb_documents(id), position TEXT,   -- 文档树
  content_json JSONB,                     -- BlockNote blocks = 真相源（CR 同名）
  content_text TEXT,                      -- 纯文本投影，搜索用（CR 同名）
  content_fingerprint TEXT,
  tags TEXT[], owner UUID,
  visibility TEXT DEFAULT 'private',      -- private|team|workspace；错题本默认 private
  source_ref JSONB,                       -- ai_report/case 来源 {type,id}
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE kb_revisions (
  id BIGSERIAL PRIMARY KEY, document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  revision INT NOT NULL, content_json JSONB, edited_by UUID, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (document_id, revision)
);
CREATE TABLE kb_links (                  -- @双链（CR document_links 同构）
  workspace_id UUID NOT NULL,
  source_document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (source_document_id, target_document_id)
);
CREATE TABLE kb_business_refs (          -- 8.4 按对象反查
  workspace_id UUID NOT NULL, document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,              -- account|task|changeset|work_item|material
  object_id TEXT NOT NULL, media TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (document_id, object_type, object_id)
);
CREATE INDEX idx_kb_documents_fts ON kb_documents
  USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_text,'')));

-- ── 9.4 卡片中心（L0 只读直跑｜L1 低风险确认｜L2 变更集确认+hash｜L3 跳 Web）
CREATE TABLE card_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  kind TEXT NOT NULL,                     -- alert|approval|daily_report|dispatch|...
  level TEXT NOT NULL,                    -- L0|L1|L2|L3
  schema JSONB NOT NULL, version INT DEFAULT 1, enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, kind, version)
);
CREATE TABLE card_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES card_templates(id),
  target_type TEXT, target_id TEXT,       -- work_item|changeset|approval|dispatch
  changeset_id UUID, changeset_hash TEXT, -- L2 校验
  outbound_message_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(), expires_at TIMESTAMPTZ
);
CREATE TABLE card_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  card_instance_id UUID NOT NULL REFERENCES card_instances(id),
  action TEXT NOT NULL, actor_external_id TEXT NOT NULL, actor_user_id UUID,   -- 实名溯源：钉钉 id → identity_mappings → user
  idempotency_key TEXT NOT NULL UNIQUE, hash_verified BOOLEAN,
  result TEXT, result_ref TEXT, at TIMESTAMPTZ DEFAULT now()
);


-- =====================================================================
-- v1.4.1 新增（2026-09-05 arch；老板口径：日预算卡任务级、会中途改；Codex R-012 并入 migration 014）
-- =====================================================================
CREATE TABLE task_budget_history (   -- 日预算卡版本化，写法与 assessment_price_history 完全对称
  id BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL,
  task_id TEXT NOT NULL,
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id),
  daily_budget_cap NUMERIC NOT NULL,   -- 元/日；任务级；无卡的任务不落行（使用率显 missing）
  effective_date DATE NOT NULL,
  changed_by UUID, evidence_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, task_id, effective_date)
);
-- tasks.budget 仍是任务期总预算，二者并存：日预算卡管"今天最多花多少"，总预算管"整期最多花多少"

-- v1.4.1 补（2026-09-05 晚）：返点折算按资料原样存"乘/除 + 系数"，不让人记倒数。进 migration 012（R-010a1），seed 由 R-013 在 012 之后写
ALTER TABLE channel_coefficients ADD COLUMN op TEXT NOT NULL DEFAULT 'divide' CHECK (op IN ('multiply','divide'));
-- cash_cost = (账面消耗 − 赔付) op coefficient。首批四行（来源 ka-src-0010 ka-data cash_formulas + ka-src-0003 §3.1）：
--   KUAISHOU multiply 0.7812 ｜ TENCENT divide 1.045 ｜ TOUTIAO divide 1.09 ｜ BAIDU divide 1.51
-- 备注：BAIDU/TENCENT 赔付≈消耗 → 现金贡献≈0（资料原话）；生效日期由老板给
