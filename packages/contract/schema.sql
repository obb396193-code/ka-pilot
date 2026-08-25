-- 数据库契约 v1.0（B1a 迁移蓝本；PostgreSQL；与 PRD v1.6 §3.1 硬要求一致）
-- 纪律：所有业务表带 workspace_id；B 级功能不建表；改动走 arch。

-- ═══ 租户与身份 ═══
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
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
  UNIQUE(workspace_id, task_id, media, account_id, valid_from)
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
  started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ
);
CREATE TABLE workflow_run_events (    -- 日志纯子表，经 run JOIN
  id BIGSERIAL PRIMARY KEY, run_id UUID NOT NULL,
  node_id TEXT, event TEXT, detail JSONB, at TIMESTAMPTZ DEFAULT now()
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
  cursor_date DATE, status TEXT DEFAULT 'running', created_at TIMESTAMPTZ DEFAULT now()
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
