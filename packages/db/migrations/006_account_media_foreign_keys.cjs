const NON_PARTITIONED_REFERENCES = [
  ["task_accounts", "task_accounts_account_fk"],
  ["account_balance", "account_balance_account_fk"],
  ["ad_entities", "ad_entities_account_fk"],
];
const PARTITIONED_REFERENCES = [
  ["metrics_raw", "metrics_raw_account_fk"],
  ["account_metrics_daily", "account_metrics_daily_account_fk"],
  ["ad_metrics_hourly", "ad_metrics_hourly_account_fk"],
];
const ACCOUNT_REFERENCES = [...NON_PARTITIONED_REFERENCES, ...PARTITIONED_REFERENCES];

exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    DO $$
    BEGIN
      ${ACCOUNT_REFERENCES.map(([table]) => `
        IF EXISTS (
          SELECT 1
          FROM ${table} AS child
          LEFT JOIN accounts AS account
            ON account.workspace_id = child.workspace_id
           AND account.media = child.media
           AND account.account_id = child.account_id
          WHERE account.account_id IS NULL
        ) THEN
          RAISE EXCEPTION '${table} contains orphan account tuples';
        END IF;
      `).join("\n")}
    END;
    $$;

    ${NON_PARTITIONED_REFERENCES.map(([table, constraint]) => `
      ALTER TABLE ${table}
        ADD CONSTRAINT ${constraint}
        FOREIGN KEY (workspace_id, media, account_id)
        REFERENCES accounts(workspace_id, media, account_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
        NOT VALID;
      ALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint};
    `).join("\n")}

    ${PARTITIONED_REFERENCES.map(([table, constraint]) => `
      ALTER TABLE ${table}
        ADD CONSTRAINT ${constraint}
        FOREIGN KEY (workspace_id, media, account_id)
        REFERENCES accounts(workspace_id, media, account_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT;
    `).join("\n")}
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ${[...ACCOUNT_REFERENCES].reverse().map(([table, constraint]) =>
      `ALTER TABLE ${table} DROP CONSTRAINT ${constraint};`,
    ).join("\n")}
  `);
};
