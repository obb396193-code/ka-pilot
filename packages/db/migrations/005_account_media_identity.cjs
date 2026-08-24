const DIRECT_ACCOUNT_TABLES = [
  "task_accounts",
  "metrics_raw",
  "account_metrics_daily",
  "account_balance",
  "ad_metrics_hourly",
  "ad_entities",
];

function addAndBackfillMediaSql(table) {
  return `
    ALTER TABLE ${table} ADD COLUMN media TEXT;
    UPDATE ${table} AS target
    SET media = account.media
    FROM accounts AS account
    WHERE account.workspace_id = target.workspace_id
      AND account.account_id = target.account_id;
  `;
}

function validateMediaSql(table) {
  return `
    IF EXISTS (
      SELECT 1 FROM ${table}
      WHERE media IS NULL OR btrim(media) = ''
    ) THEN
      RAISE EXCEPTION USING
        MESSAGE = '${table} contains an account reference without deterministic media',
        HINT = 'Create or repair the unique legacy accounts row before retrying; do not use a default media.';
    END IF;
  `;
}

function setMediaNotNullSql(table) {
  return `ALTER TABLE ${table} ALTER COLUMN media SET NOT NULL;`;
}

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE accounts ALTER COLUMN media DROP DEFAULT;

    ${DIRECT_ACCOUNT_TABLES.map(addAndBackfillMediaSql).join("\n")}

    DO $$
    BEGIN
      ${DIRECT_ACCOUNT_TABLES.map(validateMediaSql).join("\n")}
    END;
    $$;

    ${DIRECT_ACCOUNT_TABLES.map(setMediaNotNullSql).join("\n")}

    ALTER TABLE task_accounts
      DROP CONSTRAINT task_accounts_task_id_account_id_valid_from_key;
    ALTER TABLE task_accounts
      ADD CONSTRAINT task_accounts_workspace_task_media_account_valid_from_key
      UNIQUE (workspace_id, task_id, media, account_id, valid_from);

    DROP INDEX idx_metrics_raw_replay;
    CREATE INDEX idx_metrics_raw_replay
      ON metrics_raw(workspace_id, media, account_id, ds, resource);

    ALTER TABLE accounts DROP CONSTRAINT accounts_pkey;
    ALTER TABLE accounts
      ADD PRIMARY KEY (workspace_id, media, account_id);

    ALTER TABLE account_metrics_daily
      DROP CONSTRAINT account_metrics_daily_pkey;
    ALTER TABLE account_metrics_daily
      ADD PRIMARY KEY (workspace_id, media, account_id, ds);

    ALTER TABLE account_balance DROP CONSTRAINT account_balance_pkey;
    ALTER TABLE account_balance
      ADD PRIMARY KEY (workspace_id, media, account_id);

    CREATE INDEX idx_task_accounts_account_scope
      ON task_accounts(workspace_id, media, account_id, valid_from, valid_to);
    CREATE INDEX idx_account_metrics_daily_account_scope
      ON account_metrics_daily(workspace_id, media, account_id, ds);
    CREATE INDEX idx_account_balance_account_scope
      ON account_balance(workspace_id, media, account_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM accounts
        GROUP BY workspace_id, account_id
        HAVING count(DISTINCT media) > 1
      ) THEN
        RAISE EXCEPTION 'Cannot downgrade: same account_id exists in multiple media';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM account_metrics_daily
        GROUP BY workspace_id, account_id, ds
        HAVING count(DISTINCT media) > 1
      ) THEN
        RAISE EXCEPTION 'Cannot downgrade: canonical account-day exists in multiple media';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM account_balance
        GROUP BY workspace_id, account_id
        HAVING count(DISTINCT media) > 1
      ) THEN
        RAISE EXCEPTION 'Cannot downgrade: account balance exists in multiple media';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM task_accounts
        GROUP BY task_id, account_id, valid_from
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION 'Cannot downgrade: task-account identity collides without media';
      END IF;
    END;
    $$;

    DROP INDEX IF EXISTS idx_account_balance_account_scope;
    DROP INDEX IF EXISTS idx_account_metrics_daily_account_scope;
    DROP INDEX IF EXISTS idx_task_accounts_account_scope;

    ALTER TABLE account_balance DROP CONSTRAINT account_balance_pkey;
    ALTER TABLE account_balance DROP COLUMN media;
    ALTER TABLE account_balance ADD PRIMARY KEY (workspace_id, account_id);

    ALTER TABLE account_metrics_daily
      DROP CONSTRAINT account_metrics_daily_pkey;
    ALTER TABLE account_metrics_daily DROP COLUMN media;
    ALTER TABLE account_metrics_daily
      ADD PRIMARY KEY (workspace_id, account_id, ds);

    ALTER TABLE accounts DROP CONSTRAINT accounts_pkey;
    ALTER TABLE accounts ADD PRIMARY KEY (workspace_id, account_id);
    ALTER TABLE accounts ALTER COLUMN media SET DEFAULT 'KUAISHOU';

    DROP INDEX idx_metrics_raw_replay;
    ALTER TABLE metrics_raw DROP COLUMN media;
    CREATE INDEX idx_metrics_raw_replay
      ON metrics_raw(workspace_id, account_id, ds, resource);

    ALTER TABLE task_accounts
      DROP CONSTRAINT task_accounts_workspace_task_media_account_valid_from_key;
    ALTER TABLE task_accounts DROP COLUMN media;
    ALTER TABLE task_accounts
      ADD CONSTRAINT task_accounts_task_id_account_id_valid_from_key
      UNIQUE (task_id, account_id, valid_from);

    ALTER TABLE ad_metrics_hourly DROP COLUMN media;
    ALTER TABLE ad_entities DROP COLUMN media;
  `);
};
