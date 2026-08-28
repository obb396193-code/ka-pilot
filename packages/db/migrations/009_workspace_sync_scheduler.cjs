exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE workspaces
      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE workspaces DROP COLUMN is_active;
  `);
};
