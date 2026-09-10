// arch v1.9.25: may ship independently; future migrations take the next unused
// number, never insert a lower-numbered migration after 025 has been applied.
// Stopped-writer maintenance window, not an online/low-lock migration.
const partitionFunction = (includeAccountHourly) => {
  const tables = ["metrics_raw", "account_metrics_daily", "ad_metrics_hourly"];
  if (includeAccountHourly) tables.push("account_metrics_hourly");
  return `
    CREATE OR REPLACE FUNCTION ensure_monthly_metric_partitions(p_month_start DATE)
    RETURNS VOID LANGUAGE plpgsql AS $$
    DECLARE
      month_start DATE := date_trunc('month', p_month_start)::date;
      month_end DATE := (date_trunc('month', p_month_start) + INTERVAL '1 month')::date;
      suffix TEXT := to_char(month_start, 'YYYY_MM');
    BEGIN
      ${tables.map((table) => `EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF ${table} FOR VALUES FROM (%L) TO (%L)',
        '${table}_' || suffix, month_start, month_end
      );`).join("\n")}
    END;
    $$;
  `;
};

exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    CREATE TABLE account_metrics_hourly (
      workspace_id UUID NOT NULL, media TEXT NOT NULL, account_id TEXT NOT NULL,
      ds DATE NOT NULL, hh SMALLINT NOT NULL CHECK (hh BETWEEN 0 AND 23),
      cost NUMERIC, exposure BIGINT, click BIGINT, conversion BIGINT, real_conversion BIGINT, budget NUMERIC,
      last_sync_time TIMESTAMPTZ NOT NULL,
      sampled_at TIMESTAMPTZ NOT NULL,
      complete BOOLEAN NOT NULL,
      source_run_id BIGINT,
      FOREIGN KEY (workspace_id, media, account_id)
        REFERENCES accounts(workspace_id, media, account_id) ON DELETE RESTRICT,
      PRIMARY KEY (workspace_id, media, account_id, ds, hh)
    ) PARTITION BY RANGE (ds);

    CREATE INDEX etl_runs_workspace_started_id_idx
      ON etl_runs (workspace_id, started_at DESC, id DESC);

    ${partitionFunction(true)}
    SELECT ensure_monthly_metric_partitions(month_start::date)
    FROM generate_series(
      date_trunc('month', current_date) - INTERVAL '3 months',
      date_trunc('month', current_date) + INTERVAL '1 month',
      INTERVAL '1 month'
    ) AS month_start;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE account_metrics_hourly IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM account_metrics_hourly LIMIT 1) THEN
        RAISE EXCEPTION 'account_metrics_hourly still holds rows; cannot downgrade losslessly';
      END IF;
    END $$;
    ${partitionFunction(false)}
    DROP TABLE account_metrics_hourly;
    DROP INDEX etl_runs_workspace_started_id_idx;
  `);
};
