// v1.9.49 ①（Q-044 ③）：归属按业务日生效。
//
// 原来主键是 (workspace_id, media, account_id)——一个账户只有一行，reparse 就是覆盖。
// schema.sql 那句「改名后重解析、留旧行做历史」在这个主键下做不到：
// 今天读 9 月的窗口用的是今天的归属，账户 10 月改过名，9 月的报表就跟着变，而且看不出来。
//
// 业务日口径与 `shanghaiTaskBusinessDate` 完全一致：UTC 时刻 + 5 小时取日期（上海 03:00 切日）。
// **不能**写成 `AT TIME ZONE 'Asia/Shanghai'`——那是午夜切日，03:00 前解析的行会被记到后一天，
// 于是同一个账户在「今天」这一格上会先后读到两行不同的归属。
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE account_name_parses IN ACCESS EXCLUSIVE MODE;

    ALTER TABLE account_name_parses ADD COLUMN effective_from DATE;
    -- 既有行按解析时刻补业务日。parsed_at 有默认值、实际不会空；真遇到空值只能取迁移当下，
    -- 那是「没有更好的事实」时唯一不编造的选择。
    UPDATE account_name_parses
       SET effective_from = ((COALESCE(parsed_at, now()) AT TIME ZONE 'UTC') + interval '5 hours')::date;
    ALTER TABLE account_name_parses ALTER COLUMN effective_from SET NOT NULL;
    -- 默认值 = 今天的业务日：既有的每一处 INSERT（代码与用例）不带这一列也继续合法，
    -- 语义正好是「不带 from 的重解析写今天」。
    ALTER TABLE account_name_parses
      ALTER COLUMN effective_from SET DEFAULT (((now() AT TIME ZONE 'UTC') + interval '5 hours')::date);

    ALTER TABLE account_name_parses DROP CONSTRAINT account_name_parses_pkey;
    ALTER TABLE account_name_parses ADD PRIMARY KEY (workspace_id, media, account_id, effective_from);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    LOCK TABLE account_name_parses IN ACCESS EXCLUSIVE MODE;

    -- 有账户已经攒出两行以上的历史时拒绝降级：退回三列主键只能留一行，
    -- 丢掉的那些正是「某段时间这个账户归谁」——把历史报表的归属算错，不是少一列。
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM account_name_parses
                 GROUP BY workspace_id, media, account_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'account_name_parses holds attribution history; cannot downgrade losslessly';
      END IF;
    END $$;

    ALTER TABLE account_name_parses DROP CONSTRAINT account_name_parses_pkey;
    ALTER TABLE account_name_parses ADD PRIMARY KEY (workspace_id, media, account_id);
    ALTER TABLE account_name_parses DROP COLUMN effective_from;
  `);
};
