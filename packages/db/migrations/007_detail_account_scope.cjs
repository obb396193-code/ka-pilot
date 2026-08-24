exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE work_items ADD COLUMN media TEXT;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM work_items AS work_item
        LEFT JOIN LATERAL (
          SELECT count(*) AS matches
          FROM accounts AS account
          WHERE account.workspace_id = work_item.workspace_id
            AND account.account_id = work_item.account_id
        ) AS candidate ON true
        WHERE work_item.account_id IS NOT NULL
          AND candidate.matches <> 1
      ) THEN
        RAISE EXCEPTION 'work_items contains an account reference without deterministic media';
      END IF;
    END;
    $$;

    UPDATE work_items AS work_item
    SET media = account.media
    FROM accounts AS account
    WHERE work_item.workspace_id = account.workspace_id
      AND work_item.account_id = account.account_id;

    ALTER TABLE work_items
      ADD CONSTRAINT work_items_account_scope_pair_ck
      CHECK ((account_id IS NULL) = (media IS NULL));
    ALTER TABLE work_items
      ADD CONSTRAINT work_items_account_fk
      FOREIGN KEY (workspace_id, media, account_id)
      REFERENCES accounts(workspace_id, media, account_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
      NOT VALID;
    ALTER TABLE work_items VALIDATE CONSTRAINT work_items_account_fk;
    CREATE INDEX idx_work_items_account_scope
      ON work_items(workspace_id, media, account_id, status, created_at DESC);

    ALTER TABLE changesets ADD COLUMN media TEXT;
    ALTER TABLE changesets ADD COLUMN account_id TEXT;
    UPDATE changesets AS changeset
    SET media = work_item.media,
        account_id = work_item.account_id
    FROM work_items AS work_item
    WHERE changeset.workspace_id = work_item.workspace_id
      AND changeset.work_item_id = work_item.id;
    ALTER TABLE changesets
      ADD CONSTRAINT changesets_account_scope_pair_ck
      CHECK ((account_id IS NULL) = (media IS NULL));
    ALTER TABLE changesets
      ADD CONSTRAINT changesets_account_fk
      FOREIGN KEY (workspace_id, media, account_id)
      REFERENCES accounts(workspace_id, media, account_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
      NOT VALID;
    ALTER TABLE changesets VALIDATE CONSTRAINT changesets_account_fk;
    CREATE INDEX idx_changesets_account_scope
      ON changesets(workspace_id, media, account_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX idx_changesets_account_scope;
    ALTER TABLE changesets DROP CONSTRAINT changesets_account_fk;
    ALTER TABLE changesets DROP CONSTRAINT changesets_account_scope_pair_ck;
    ALTER TABLE changesets DROP COLUMN account_id;
    ALTER TABLE changesets DROP COLUMN media;

    DROP INDEX idx_work_items_account_scope;
    ALTER TABLE work_items DROP CONSTRAINT work_items_account_fk;
    ALTER TABLE work_items DROP CONSTRAINT work_items_account_scope_pair_ck;
    ALTER TABLE work_items DROP COLUMN media;
  `);
};
