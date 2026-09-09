// Contract v1.9.12 (Q-022 访客登录): the demo workspace guests land in.
//
// arch 裁定**不加 `demo` 这个 workspaceKind**（全仓 20 多处 `kind === "team"` 判断都要跟着过一遍，
// 不值当）。改法：演示空间就是 `kind='team'`（天然只读全量、scope 复用 team_workspace_readonly）
// 外加一个标记列 `is_demo`。DDL 逐字取自 schema.sql 第 12 行。
//
// 只加列不动数据：现有空间全部默认 false。
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    ALTER TABLE workspaces ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      -- 还有演示空间时不许回滚：丢了这个标记，那个空间就变成一个普通团队空间，
      -- 访客会话会落到「看起来是真数据」的地方。先把演示空间清掉再回滚。
      IF EXISTS (SELECT 1 FROM workspaces WHERE is_demo) THEN
        RAISE EXCEPTION 'demo workspaces still exist; cannot drop workspaces.is_demo';
      END IF;
    END;
    $$;

    ALTER TABLE workspaces DROP COLUMN is_demo;
  `);
};
