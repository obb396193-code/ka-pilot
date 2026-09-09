// Contract v1.9.6 (Q-022 访客登录): the demo workspace guests land in.
//
// `workspaces_kind_ck` 目前只允许 personal|team，所以 kind='demo' 的演示空间**建不出来**
// —— 灌数脚本会被约束挡回去。schema.sql 里这一行还没改（那是 arch 的权威文件），
// 已在回执请他同步；这里的依据是 api.md v1.9.6。
//
// 只放宽约束、不动任何数据：现有 personal/team 行不受影响。
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    ALTER TABLE workspaces DROP CONSTRAINT workspaces_kind_ck;
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_kind_ck
      CHECK (kind IN ('personal', 'team', 'demo'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      -- 有演示空间时不许收窄：收窄会让那条 workspaces 行违反约束，回滚当场失败，
      -- 更糟的是把访客体系打回「登录后无处可去」。先清演示空间再回滚。
      IF EXISTS (SELECT 1 FROM workspaces WHERE kind = 'demo') THEN
        RAISE EXCEPTION 'demo workspaces still exist; cannot narrow workspaces_kind_ck';
      END IF;
    END;
    $$;

    ALTER TABLE workspaces DROP CONSTRAINT workspaces_kind_ck;
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_kind_ck
      CHECK (kind IN ('personal', 'team'));
  `);
};
