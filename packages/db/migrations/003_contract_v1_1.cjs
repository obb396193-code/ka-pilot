exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE etl_runs ADD COLUMN workspace_id UUID;
    ALTER TABLE backfill_jobs ADD COLUMN workspace_id UUID;
    ALTER TABLE data_quality_checks ADD COLUMN workspace_id UUID;
    ALTER TABLE inbound_events ADD COLUMN workspace_id UUID;

    ALTER TABLE workflow_versions ADD COLUMN workspace_id UUID;
    UPDATE workflow_versions AS version
    SET workspace_id = definition.workspace_id
    FROM workflow_definitions AS definition
    WHERE definition.id = version.definition_id;

    ALTER TABLE workflow_runs ADD COLUMN workspace_id UUID;
    UPDATE workflow_runs AS run
    SET workspace_id = version.workspace_id
    FROM workflow_versions AS version
    WHERE version.id = run.version_id;

    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM workflow_versions WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'workflow_versions contains rows without a resolvable workspace_id';
      END IF;
      IF EXISTS (SELECT 1 FROM workflow_runs WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'workflow_runs contains rows without a resolvable workspace_id';
      END IF;
    END;
    $$;

    ALTER TABLE workflow_versions ALTER COLUMN workspace_id SET NOT NULL;
    ALTER TABLE workflow_runs ALTER COLUMN workspace_id SET NOT NULL;

    ALTER TABLE metrics_raw ADD COLUMN resource TEXT;
    ALTER TABLE metrics_raw ADD COLUMN request_params JSONB;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM metrics_raw WHERE resource IS NULL) THEN
        RAISE EXCEPTION USING
          MESSAGE = 'metrics_raw contains legacy rows; explicitly backfill resource before applying contract v1.1',
          HINT = 'Do not infer ad_realtime vs account_realtime from source alone.';
      END IF;
    END;
    $$;
    ALTER TABLE metrics_raw ALTER COLUMN resource SET NOT NULL;
    CREATE INDEX idx_metrics_raw_replay
      ON metrics_raw(workspace_id, account_id, ds, resource);

    ALTER TABLE assessment_price_history
      DROP CONSTRAINT assessment_price_history_task_id_fkey;
    ALTER TABLE tasks DROP CONSTRAINT tasks_pkey;
    ALTER TABLE tasks ADD PRIMARY KEY (workspace_id, task_id);
    ALTER TABLE assessment_price_history
      ADD CONSTRAINT assessment_price_history_workspace_task_fkey
      FOREIGN KEY (workspace_id, task_id)
      REFERENCES tasks(workspace_id, task_id);

    ALTER TABLE accounts DROP CONSTRAINT accounts_pkey;
    ALTER TABLE accounts ADD PRIMARY KEY (workspace_id, account_id);

    ALTER TABLE account_metrics_daily DROP CONSTRAINT account_metrics_daily_pkey;
    ALTER TABLE account_metrics_daily
      ADD PRIMARY KEY (workspace_id, account_id, ds);

    ALTER TABLE ad_metrics_hourly DROP CONSTRAINT ad_metrics_hourly_pkey;
    ALTER TABLE ad_metrics_hourly
      ADD PRIMARY KEY (workspace_id, ad_id, ds, hh);

    ALTER TABLE ad_entities DROP CONSTRAINT ad_entities_pkey;
    ALTER TABLE ad_entities
      ADD PRIMARY KEY (workspace_id, entity_id, entity_type);

    ALTER TABLE account_balance DROP CONSTRAINT account_balance_pkey;
    ALTER TABLE account_balance ADD PRIMARY KEY (workspace_id, account_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE assessment_price_history
      DROP CONSTRAINT assessment_price_history_workspace_task_fkey;
    ALTER TABLE tasks DROP CONSTRAINT tasks_pkey;
    ALTER TABLE tasks ADD PRIMARY KEY (task_id);
    ALTER TABLE assessment_price_history
      ADD CONSTRAINT assessment_price_history_task_id_fkey
      FOREIGN KEY (task_id) REFERENCES tasks(task_id);

    ALTER TABLE accounts DROP CONSTRAINT accounts_pkey;
    ALTER TABLE accounts ADD PRIMARY KEY (account_id);

    ALTER TABLE account_metrics_daily DROP CONSTRAINT account_metrics_daily_pkey;
    ALTER TABLE account_metrics_daily ADD PRIMARY KEY (account_id, ds);

    ALTER TABLE ad_metrics_hourly DROP CONSTRAINT ad_metrics_hourly_pkey;
    ALTER TABLE ad_metrics_hourly ADD PRIMARY KEY (ad_id, ds, hh);

    ALTER TABLE ad_entities DROP CONSTRAINT ad_entities_pkey;
    ALTER TABLE ad_entities ADD PRIMARY KEY (entity_id, entity_type);

    ALTER TABLE account_balance DROP CONSTRAINT account_balance_pkey;
    ALTER TABLE account_balance ADD PRIMARY KEY (account_id);

    DROP INDEX IF EXISTS idx_metrics_raw_replay;
    ALTER TABLE metrics_raw DROP COLUMN request_params;
    ALTER TABLE metrics_raw DROP COLUMN resource;

    ALTER TABLE workflow_runs DROP COLUMN workspace_id;
    ALTER TABLE workflow_versions DROP COLUMN workspace_id;
    ALTER TABLE inbound_events DROP COLUMN workspace_id;
    ALTER TABLE data_quality_checks DROP COLUMN workspace_id;
    ALTER TABLE backfill_jobs DROP COLUMN workspace_id;
    ALTER TABLE etl_runs DROP COLUMN workspace_id;
  `);
};
