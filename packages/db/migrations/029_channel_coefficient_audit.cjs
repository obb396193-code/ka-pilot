// arch api v1.9.44: retain unknown legacy modification time. ADD DEFAULT now()
// in one statement would falsely stamp every old version as modified today.
// New writes get a timestamp; historical NULL must remain visibly unknown.
// Maintenance-window migration, not an online/low-lock deployment claim.
exports.up = pgm => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    ALTER TABLE channel_coefficients ADD COLUMN created_at TIMESTAMPTZ;
    ALTER TABLE channel_coefficients ALTER COLUMN created_at SET DEFAULT now();
    ALTER TABLE channel_coefficients ADD COLUMN evidence_url TEXT;
    CREATE INDEX channel_coefficients_change_log_idx ON channel_coefficients(workspace_id,created_at DESC,id DESC);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE channel_coefficients IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM channel_coefficients WHERE created_at IS NOT NULL OR evidence_url IS NOT NULL) THEN
        RAISE EXCEPTION 'channel_coefficients contains audit metadata; cannot downgrade losslessly';
      END IF;
    END $$;
    DROP INDEX channel_coefficients_change_log_idx;
    ALTER TABLE channel_coefficients DROP COLUMN evidence_url;
    ALTER TABLE channel_coefficients DROP COLUMN created_at;
  `);
};
