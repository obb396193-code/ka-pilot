// First-deployment/maintenance-window migration. The reviewed R009 backfill
// supplement is folded here before batch release; 012 remains reserved for arch.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    CREATE EXTENSION IF NOT EXISTS btree_gist;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM task_accounts
        WHERE valid_to IS NOT NULL AND valid_to < valid_from
      ) THEN
        RAISE EXCEPTION 'task_accounts contains an invalid validity interval';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM task_accounts AS left_assignment
        JOIN task_accounts AS right_assignment
          ON left_assignment.id < right_assignment.id
         AND left_assignment.workspace_id = right_assignment.workspace_id
         AND left_assignment.media = right_assignment.media
         AND left_assignment.account_id = right_assignment.account_id
         AND daterange(
               left_assignment.valid_from,
               COALESCE(left_assignment.valid_to, 'infinity'::date),
               '[]'
             ) && daterange(
               right_assignment.valid_from,
               COALESCE(right_assignment.valid_to, 'infinity'::date),
               '[]'
             )
      ) THEN
        RAISE EXCEPTION 'task_accounts contains overlapping account assignments';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM changesets AS changeset
        LEFT JOIN users AS initiator
          ON initiator.workspace_id = changeset.workspace_id
         AND initiator.id = changeset.initiator
        LEFT JOIN users AS credential_owner
          ON credential_owner.workspace_id = changeset.workspace_id
         AND credential_owner.id = changeset.credential_owner_user_id
        WHERE initiator.id IS NULL OR credential_owner.id IS NULL
      ) THEN
        RAISE EXCEPTION 'changesets contains an actor outside its workspace';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM changeset_items AS item
        JOIN changesets AS changeset ON changeset.id = item.changeset_id
        WHERE changeset.media IS NULL OR changeset.account_id IS NULL
      ) THEN
        RAISE EXCEPTION 'changeset_items contains an item without deterministic account scope';
      END IF;

      IF EXISTS (
        SELECT 1 FROM backfill_jobs
        WHERE status IS NULL OR status NOT IN ('running', 'raw_done', 'canonical_done', 'done', 'failed')
      ) THEN
        RAISE EXCEPTION 'backfill_jobs contains a legacy status that must be resolved before migration';
      END IF;
    END;
    $$;

    ALTER TABLE task_accounts
      ADD CONSTRAINT task_accounts_account_validity_excl
      EXCLUDE USING gist (
        workspace_id WITH =,
        media WITH =,
        account_id WITH =,
        daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
      );

    ALTER TABLE workflow_runs
      ADD COLUMN executor_token UUID,
      ADD COLUMN executor_lease_until TIMESTAMPTZ;

    CREATE TABLE workflow_effects (
      id BIGSERIAL PRIMARY KEY,
      run_id UUID NOT NULL REFERENCES workflow_runs(id),
      node_id TEXT NOT NULL,
      attempt INT NOT NULL,
      phase TEXT NOT NULL,
      effect_key TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      result JSONB,
      created_at TIMESTAMPTZ DEFAULT now(),
      finished_at TIMESTAMPTZ,
      CONSTRAINT workflow_effects_run_node_attempt_phase_key
        UNIQUE (run_id, node_id, attempt, phase)
    );

    ALTER TABLE inbound_events
      ADD COLUMN lease_until TIMESTAMPTZ,
      ADD COLUMN attempts INT DEFAULT 0,
      ADD COLUMN max_attempts INT DEFAULT 5,
      ADD COLUMN last_error TEXT,
      ADD COLUMN processed_at TIMESTAMPTZ;

    ALTER TABLE changesets
      ADD CONSTRAINT changesets_workspace_initiator_fk
      FOREIGN KEY (workspace_id, initiator)
      REFERENCES users(workspace_id, id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
      ADD CONSTRAINT changesets_workspace_credential_owner_fk
      FOREIGN KEY (workspace_id, credential_owner_user_id)
      REFERENCES users(workspace_id, id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;

    ALTER TABLE changeset_items
      ADD COLUMN workspace_id UUID,
      ADD COLUMN media TEXT,
      ADD COLUMN account_id TEXT;

    UPDATE changeset_items AS item
    SET workspace_id = changeset.workspace_id,
        media = changeset.media,
        account_id = changeset.account_id
    FROM changesets AS changeset
    WHERE changeset.id = item.changeset_id;

    ALTER TABLE changeset_items
      ALTER COLUMN workspace_id SET NOT NULL,
      ALTER COLUMN media SET NOT NULL,
      ALTER COLUMN account_id SET NOT NULL,
      ADD CONSTRAINT changeset_items_account_fk
      FOREIGN KEY (workspace_id, media, account_id)
      REFERENCES accounts(workspace_id, media, account_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
    CREATE INDEX idx_changeset_items_account_scope
      ON changeset_items(workspace_id, media, account_id, changeset_id);

    ALTER TABLE backfill_jobs
      ADD COLUMN failed_stage TEXT,
      ADD COLUMN finished_at TIMESTAMPTZ;

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
      DROP CONSTRAINT backfill_jobs_status_check,
      DROP COLUMN finished_at,
      DROP COLUMN failed_stage;

    DROP INDEX idx_changeset_items_account_scope;
    ALTER TABLE changeset_items
      DROP CONSTRAINT changeset_items_account_fk,
      DROP COLUMN account_id,
      DROP COLUMN media,
      DROP COLUMN workspace_id;

    ALTER TABLE changesets
      DROP CONSTRAINT changesets_workspace_credential_owner_fk,
      DROP CONSTRAINT changesets_workspace_initiator_fk;

    ALTER TABLE inbound_events
      DROP COLUMN processed_at,
      DROP COLUMN last_error,
      DROP COLUMN max_attempts,
      DROP COLUMN attempts,
      DROP COLUMN lease_until;

    DROP TABLE workflow_effects;
    ALTER TABLE workflow_runs
      DROP COLUMN executor_lease_until,
      DROP COLUMN executor_token;

    ALTER TABLE task_accounts
      DROP CONSTRAINT task_accounts_account_validity_excl;
  `);
};
