// arch api v1.9.44: daily_cap is the physical column name (not the old
// schema draft's daily_budget_cap). Append versions; no public write route here.
// Run before service startup or in a stopped-writer maintenance window.
exports.up = pgm => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    CREATE TABLE task_budget_history (
      id BIGSERIAL PRIMARY KEY,
      workspace_id UUID NOT NULL,
      task_id TEXT NOT NULL,
      daily_cap NUMERIC NOT NULL CHECK (
        daily_cap >= 0 AND daily_cap NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
      ),
      effective_date DATE NOT NULL,
      changed_by UUID,
      evidence_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      FOREIGN KEY (workspace_id,task_id) REFERENCES tasks(workspace_id,task_id)
    );
    CREATE INDEX task_budget_history_change_log_idx ON task_budget_history(workspace_id,created_at DESC,id DESC);
    -- Same-effective-day revisions are distinct records (api v1.9.44).
    CREATE INDEX task_budget_history_effective_idx ON task_budget_history(workspace_id,task_id,effective_date,created_at,id);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE task_budget_history IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM task_budget_history) THEN
        RAISE EXCEPTION 'task_budget_history contains versions; cannot downgrade losslessly';
      END IF;
    END $$;
    DROP TABLE task_budget_history;
  `);
};
