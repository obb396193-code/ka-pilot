// Contract v1.3 + explicitly assigned op/availability additions; no public routes.
// Run before workers in a stopped-write maintenance window. Refuse lossy downgrade.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM agent_messages m LEFT JOIN agent_sessions s ON s.id=m.session_id
        WHERE s.id IS NULL
      ) THEN
        RAISE EXCEPTION 'agent_messages contains orphan sessions';
      END IF;
      IF EXISTS (
        SELECT 1 FROM agent_context_items c LEFT JOIN agent_sessions s ON s.id=c.session_id
        WHERE s.id IS NULL
      ) THEN
        RAISE EXCEPTION 'agent_context_items contains orphan sessions';
      END IF;
    END;
    $$;

ALTER TABLE alert_rules ADD COLUMN condition_tree JSONB;
ALTER TABLE alert_rules ADD COLUMN fallback_copy TEXT;

ALTER TABLE work_items ADD COLUMN dedupe_key TEXT;
ALTER TABLE work_items ADD COLUMN occurrence_count INT DEFAULT 1;
ALTER TABLE work_items ADD COLUMN last_triggered_at TIMESTAMPTZ;
CREATE UNIQUE INDEX uq_work_items_active_dedupe ON work_items(workspace_id, dedupe_key)
  WHERE status IN ('open','processing','dispatched');

CREATE TABLE account_mutes (
  workspace_id UUID NOT NULL, media TEXT NOT NULL, account_id TEXT NOT NULL,
  muted_until DATE NOT NULL, muted_by UUID, reason_chip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, media, account_id),
  FOREIGN KEY (workspace_id, media, account_id) REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT
);

ALTER TABLE ad_entities ADD COLUMN created_at TIMESTAMPTZ;

ALTER TABLE changeset_items ALTER COLUMN from_value TYPE JSONB USING to_jsonb(from_value);
ALTER TABLE changeset_items ALTER COLUMN to_value   TYPE JSONB USING to_jsonb(to_value);

ALTER TABLE changesets ADD COLUMN dry_run_hash TEXT;
ALTER TABLE changesets ADD COLUMN confirm_hash TEXT;

ALTER TABLE agent_messages ADD COLUMN seq INT;
ALTER TABLE agent_messages ADD COLUMN client_message_id TEXT;
ALTER TABLE agent_messages ADD CONSTRAINT fk_agent_messages_session FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX uq_agent_messages_seq ON agent_messages(session_id, seq);
CREATE UNIQUE INDEX uq_agent_messages_client ON agent_messages(session_id, client_message_id) WHERE client_message_id IS NOT NULL;
ALTER TABLE agent_context_items ADD CONSTRAINT fk_agent_ctx_session FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE;

ALTER TABLE agent_runs ADD COLUMN session_id UUID REFERENCES agent_sessions(id);
ALTER TABLE agent_runs ADD COLUMN provider_id TEXT;
ALTER TABLE agent_runs ADD COLUMN model TEXT;
ALTER TABLE agent_runs ADD COLUMN credential_owner_user_id UUID;
ALTER TABLE agent_runs ADD COLUMN error_code TEXT;
ALTER TABLE agent_runs ADD COLUMN attempt INT DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN first_token_at TIMESTAMPTZ;
ALTER TABLE agent_runs ADD COLUMN usage_ref TEXT;
ALTER TABLE agent_runs ADD COLUMN result_ref TEXT;

CREATE TABLE agent_run_events (
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq INT NOT NULL, kind TEXT NOT NULL,
  safe_payload JSONB, raw_ref TEXT, at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE model_provider_credentials (
  workspace_id UUID NOT NULL, user_id UUID NOT NULL, provider_id TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  status TEXT DEFAULT 'unverified',
  last_checked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, provider_id),
  FOREIGN KEY (workspace_id, user_id) REFERENCES users(workspace_id, id) ON DELETE RESTRICT
);

CREATE TABLE provider_model_capabilities (
  provider_id TEXT NOT NULL, model TEXT NOT NULL,
  protocol TEXT NOT NULL,
  supports_tools BOOLEAN, supports_stream BOOLEAN, supports_structured BOOLEAN,
  timeout_ms INT, sdk_compat TEXT,
  status TEXT DEFAULT 'documented_unverified',
  tested_at TIMESTAMPTZ, error_summary TEXT, test_version TEXT,
  PRIMARY KEY (provider_id, model)
);

ALTER TABLE channel_coefficients ADD COLUMN op TEXT NOT NULL DEFAULT 'divide' CHECK (op IN ('multiply','divide'));
ALTER TABLE alert_rules ADD COLUMN availability_policy TEXT NOT NULL DEFAULT 'suppress'
  CHECK (availability_policy IN ('suppress','evaluate_available_only'));
ALTER TABLE alert_rules ADD COLUMN data_freshness_max_hours INT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM changeset_items
        WHERE (from_value IS NOT NULL AND jsonb_typeof(from_value) IS DISTINCT FROM 'string')
           OR (to_value IS NOT NULL AND jsonb_typeof(to_value) IS DISTINCT FROM 'string')
      ) THEN
        RAISE EXCEPTION 'changeset_items contains typed JSON values; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM channel_coefficients WHERE op <> 'divide') THEN
        RAISE EXCEPTION 'channel_coefficients contains multiply values; cannot downgrade semantics';
      END IF;
    END;
    $$;

    ALTER TABLE alert_rules DROP COLUMN data_freshness_max_hours, DROP COLUMN availability_policy;
    ALTER TABLE channel_coefficients DROP COLUMN op;
    DROP TABLE provider_model_capabilities;
    DROP TABLE model_provider_credentials;
    DROP TABLE agent_run_events;
    ALTER TABLE agent_runs
      DROP COLUMN result_ref, DROP COLUMN usage_ref, DROP COLUMN first_token_at,
      DROP COLUMN attempt, DROP COLUMN error_code, DROP COLUMN credential_owner_user_id,
      DROP COLUMN model, DROP COLUMN provider_id, DROP COLUMN session_id;
    ALTER TABLE agent_context_items DROP CONSTRAINT fk_agent_ctx_session;
    DROP INDEX uq_agent_messages_client;
    DROP INDEX uq_agent_messages_seq;
    ALTER TABLE agent_messages DROP CONSTRAINT fk_agent_messages_session,
      DROP COLUMN client_message_id, DROP COLUMN seq;
    ALTER TABLE changesets DROP COLUMN confirm_hash, DROP COLUMN dry_run_hash;
    ALTER TABLE changeset_items ALTER COLUMN from_value TYPE TEXT USING (from_value #>> '{}');
    ALTER TABLE changeset_items ALTER COLUMN to_value TYPE TEXT USING (to_value #>> '{}');
    ALTER TABLE ad_entities DROP COLUMN created_at;
    DROP TABLE account_mutes;
    DROP INDEX uq_work_items_active_dedupe;
    ALTER TABLE work_items DROP COLUMN last_triggered_at, DROP COLUMN occurrence_count, DROP COLUMN dedupe_key;
    ALTER TABLE alert_rules DROP COLUMN fallback_copy, DROP COLUMN condition_tree;
  `);
};
