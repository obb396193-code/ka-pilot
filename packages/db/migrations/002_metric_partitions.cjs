exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION ensure_monthly_metric_partitions(p_month_start DATE)
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
    DECLARE
      month_start DATE := date_trunc('month', p_month_start)::date;
      month_end DATE := (date_trunc('month', p_month_start) + INTERVAL '1 month')::date;
      suffix TEXT := to_char(month_start, 'YYYY_MM');
    BEGIN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF metrics_raw FOR VALUES FROM (%L) TO (%L)',
        'metrics_raw_' || suffix, month_start, month_end
      );
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF account_metrics_daily FOR VALUES FROM (%L) TO (%L)',
        'account_metrics_daily_' || suffix, month_start, month_end
      );
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF ad_metrics_hourly FOR VALUES FROM (%L) TO (%L)',
        'ad_metrics_hourly_' || suffix, month_start, month_end
      );
    END;
    $$;

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
    DO $$
    DECLARE partition_row RECORD;
    BEGIN
      FOR partition_row IN
        SELECT child_table.relname AS child_name
        FROM pg_inherits
        JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
        JOIN pg_class child_table ON pg_inherits.inhrelid = child_table.oid
        WHERE parent.relname IN ('metrics_raw', 'account_metrics_daily', 'ad_metrics_hourly')
      LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I', partition_row.child_name);
      END LOOP;
    END;
    $$;
    DROP FUNCTION IF EXISTS ensure_monthly_metric_partitions(DATE);
  `);
};
