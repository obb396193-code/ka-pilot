exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE jobs ADD COLUMN lease_token UUID;

    UPDATE jobs
    SET status = 'queued',
        lease_until = NULL,
        last_error = 'Active lease invalidated by fencing-token migration'
    WHERE status IN ('leased', 'running');

    ALTER TABLE jobs
      ADD CONSTRAINT jobs_active_lease_guard CHECK (
        (
          status IN ('leased', 'running')
          AND lease_token IS NOT NULL
          AND lease_until IS NOT NULL
        )
        OR
        (
          COALESCE(status, '') NOT IN ('leased', 'running')
          AND lease_token IS NULL
        )
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_active_lease_guard;
    ALTER TABLE jobs DROP COLUMN IF EXISTS lease_token;
  `);
};
