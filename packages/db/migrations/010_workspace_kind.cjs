exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    ALTER TABLE workspaces ADD COLUMN kind TEXT;
    UPDATE workspaces SET kind = 'personal' WHERE kind IS NULL;
    ALTER TABLE workspaces
      ALTER COLUMN kind SET DEFAULT 'personal',
      ALTER COLUMN kind SET NOT NULL;
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_kind_ck
      CHECK (kind IN ('personal', 'team'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    ALTER TABLE workspaces DROP CONSTRAINT workspaces_kind_ck;
    ALTER TABLE workspaces DROP COLUMN kind;
  `);
};
