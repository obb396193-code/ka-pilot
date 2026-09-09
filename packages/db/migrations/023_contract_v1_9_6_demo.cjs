// Contract v1.9.12 (Q-022 访客登录): the demo workspace guests land in.
//
// arch 裁定**不加 `demo` 这个 workspaceKind**（全仓 20 多处 `kind === "team"` 判断都要跟着过一遍，
// 不值当）。改法：演示空间就是 `kind='team'`（天然只读全量、scope 复用 team_workspace_readonly）
// 外加一个标记列 `is_demo`。DDL 逐字取自 schema.sql 第 12 行。
//
// ★除了 is_demo，访客登录还有两处 DDL 前置，是我实现时撞出来的（schema.sql 尚未同步，
// 已在回执点名）：`auth_identities_provider_ck` 只认 internal_test|buc，
// `workspace_memberships_role_ck` 只认 optimizer|operator|lead|admin。
// 不放宽这两条，访客身份和 viewer 成员行**建都建不出来**，功能无从谈起。
//
// 只加列 / 放宽约束，不动任何数据：现有空间全部默认 false，现有行全部仍然合法。
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    ALTER TABLE workspaces ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE auth_identities DROP CONSTRAINT auth_identities_provider_ck;
    ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_ck
      CHECK (provider IN ('internal_test', 'buc', 'guest'));

    ALTER TABLE workspace_memberships DROP CONSTRAINT workspace_memberships_role_ck;
    ALTER TABLE workspace_memberships ADD CONSTRAINT workspace_memberships_role_ck
      CHECK (role IN ('optimizer', 'operator', 'lead', 'admin', 'viewer'));
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
      -- 同理：还有访客身份或 viewer 成员行时收窄约束会让那些行当场违规，回滚直接失败。
      IF EXISTS (SELECT 1 FROM auth_identities WHERE provider = 'guest') THEN
        RAISE EXCEPTION 'guest identities still exist; cannot narrow auth_identities_provider_ck';
      END IF;
      IF EXISTS (SELECT 1 FROM workspace_memberships WHERE role = 'viewer') THEN
        RAISE EXCEPTION 'viewer memberships still exist; cannot narrow workspace_memberships_role_ck';
      END IF;
    END;
    $$;

    ALTER TABLE workspace_memberships DROP CONSTRAINT workspace_memberships_role_ck;
    ALTER TABLE workspace_memberships ADD CONSTRAINT workspace_memberships_role_ck
      CHECK (role IN ('optimizer', 'operator', 'lead', 'admin'));

    ALTER TABLE auth_identities DROP CONSTRAINT auth_identities_provider_ck;
    ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_ck
      CHECK (provider IN ('internal_test', 'buc'));

    ALTER TABLE workspaces DROP COLUMN is_demo;
  `);
};
