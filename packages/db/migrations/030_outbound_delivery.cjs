// Maintenance-window migration. Legacy rows stay untouched until bounded claim
// resolves their business identity; historical delivery success is not invented.
exports.up = pgm => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    ALTER TABLE outbound_messages
      ADD COLUMN dedupe_key TEXT,
      ADD COLUMN dedupe_of UUID,
      ADD COLUMN run_after TIMESTAMPTZ,
      ADD COLUMN claimed_at TIMESTAMPTZ,
      ADD COLUMN lease_token UUID,
      ADD COLUMN lease_until TIMESTAMPTZ,
      ADD COLUMN consecutive_unknown INT NOT NULL DEFAULT 0;
    ALTER TABLE outbound_messages ADD CONSTRAINT outbound_workspace_id_unique UNIQUE(workspace_id,id);
    ALTER TABLE outbound_messages ADD CONSTRAINT outbound_dedupe_same_workspace_fk
      FOREIGN KEY(workspace_id,dedupe_of) REFERENCES outbound_messages(workspace_id,id);
    ALTER TABLE outbound_messages ADD CONSTRAINT outbound_unknown_count_check CHECK(consecutive_unknown BETWEEN 0 AND 2);
    ALTER TABLE outbound_messages ADD CONSTRAINT outbound_not_self_dedupe CHECK(dedupe_of IS NULL OR dedupe_of<>id);
    ALTER TABLE outbound_messages ADD CONSTRAINT outbound_managed_state_check CHECK(dedupe_key IS NULL OR (
      dedupe_key ~ '^outbound:v1:[a-f0-9]{64}$' AND workspace_id IS NOT NULL AND channel='dingtalk'
      AND target IS NOT NULL AND kind IS NOT NULL AND jsonb_typeof(payload)='object'
      AND attempts BETWEEN 0 AND 5 AND status IN ('queued','sending','sent','failed','deduplicated')
      AND CASE WHEN status='sending' THEN
        attempts>=1 AND consecutive_unknown<2 AND lease_token IS NOT NULL AND claimed_at IS NOT NULL
          AND lease_until>claimed_at AND sent_at IS NULL AND dedupe_of IS NULL
        ELSE lease_token IS NULL AND claimed_at IS NULL AND lease_until IS NULL END
      AND CASE WHEN status='sent' THEN sent_at IS NOT NULL AND attempts>=1 AND fail_reason IS NULL
        ELSE sent_at IS NULL END
      AND CASE WHEN status='deduplicated' THEN dedupe_of IS NOT NULL AND fail_reason IS NULL
        ELSE dedupe_of IS NULL END
    ) IS TRUE);
    CREATE INDEX outbound_due_idx ON outbound_messages(workspace_id,COALESCE(run_after,created_at),id)
      WHERE channel='dingtalk' AND status IN ('queued','sending');
    CREATE INDEX outbound_sent_dedupe_idx ON outbound_messages(workspace_id,dedupe_key,sent_at DESC,id)
      WHERE channel='dingtalk' AND status='sent' AND sent_at IS NOT NULL;
  `);
};

exports.down = pgm => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE outbound_messages IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM outbound_messages WHERE dedupe_key IS NOT NULL OR dedupe_of IS NOT NULL
        OR lease_token IS NOT NULL OR claimed_at IS NOT NULL OR lease_until IS NOT NULL
        OR run_after IS NOT NULL OR consecutive_unknown<>0) THEN
        RAISE EXCEPTION 'outbound_messages contains delivery metadata; cannot downgrade losslessly';
      END IF;
    END $$;
    DROP INDEX outbound_sent_dedupe_idx;
    DROP INDEX outbound_due_idx;
    ALTER TABLE outbound_messages DROP CONSTRAINT outbound_managed_state_check,
      DROP CONSTRAINT outbound_not_self_dedupe, DROP CONSTRAINT outbound_unknown_count_check,
      DROP CONSTRAINT outbound_dedupe_same_workspace_fk, DROP CONSTRAINT outbound_workspace_id_unique;
    ALTER TABLE outbound_messages DROP COLUMN dedupe_key, DROP COLUMN dedupe_of, DROP COLUMN run_after,
      DROP COLUMN claimed_at, DROP COLUMN lease_token, DROP COLUMN lease_until, DROP COLUMN consecutive_unknown;
  `);
};
