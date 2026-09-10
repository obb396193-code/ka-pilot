// arch v1.9.28 / be2 Q-043：任务管理视图要的四个字段 + 考核价作废段。
// 编号按 v1.9.25「落地时的下一个空号，永不回填」取 027：026 是 v1.9.25 公告给 Codex 的
// dispatches，他那支还没合，占它会跟他在飞的分支撞车。
// Stopped-writer maintenance window, not an online/low-lock migration.

exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    ALTER TABLE tasks
      ADD COLUMN aliases TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN monitor_url TEXT,
      ADD COLUMN product_name TEXT;

    ALTER TABLE assessment_price_history
      ADD COLUMN op TEXT NOT NULL DEFAULT 'set';
    ALTER TABLE assessment_price_history
      ADD CONSTRAINT assessment_price_history_op_check CHECK (op IN ('set','revoke'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE tasks IN ACCESS EXCLUSIVE MODE;
    LOCK TABLE assessment_price_history IN ACCESS EXCLUSIVE MODE;

    -- 降级前先确认这三样东西没人用过：丢掉别名会让「昵称按别名绑任务」的解析结果无法复现，
    -- 丢掉 revoke 行会让被作废的价重新生效——那是把钱算错，不是少一列。
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM tasks
                 WHERE aliases <> '{}' OR monitor_url IS NOT NULL OR product_name IS NOT NULL) THEN
        RAISE EXCEPTION 'tasks still carry v1.9.28 fields; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM assessment_price_history WHERE op <> 'set') THEN
        RAISE EXCEPTION 'assessment_price_history still holds revoke rows; cannot downgrade losslessly';
      END IF;
      -- paused 是这一版新增的状态值，降级后没有任何东西认识它。
      IF EXISTS (SELECT 1 FROM tasks WHERE status = 'paused') THEN
        RAISE EXCEPTION 'tasks still hold paused status; cannot downgrade losslessly';
      END IF;
    END $$;

    ALTER TABLE assessment_price_history DROP CONSTRAINT assessment_price_history_op_check;
    ALTER TABLE assessment_price_history DROP COLUMN op;
    ALTER TABLE tasks DROP COLUMN product_name;
    ALTER TABLE tasks DROP COLUMN monitor_url;
    ALTER TABLE tasks DROP COLUMN aliases;
  `);
};
