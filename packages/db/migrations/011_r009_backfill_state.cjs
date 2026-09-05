// Append-only supplement to the already reviewed 011; reserve 012 for arch.
// Deploy in the stopped-worker migration window, before startup recovery.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    ALTER TABLE backfill_jobs
      ADD CONSTRAINT backfill_jobs_status_check CHECK (
        status IS NOT NULL AND status IN ('running', 'raw_done', 'canonical_done', 'done', 'failed')
      ),
      ADD CONSTRAINT backfill_jobs_failed_stage_check CHECK (
        failed_stage IS NULL OR failed_stage IN ('raw', 'canonical', 'quality')
      );

    -- Legacy done only proved raw completion. Startup derives the new state
    -- from all three stages; never grandfather an unverified completion.
    UPDATE backfill_jobs SET status = 'running', finished_at = NULL, failed_stage = NULL
    WHERE status = 'done';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    ALTER TABLE backfill_jobs
      DROP CONSTRAINT backfill_jobs_failed_stage_check,
      DROP CONSTRAINT backfill_jobs_status_check;
  `);
};
