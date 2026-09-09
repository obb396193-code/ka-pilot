// Contract v1.8 (account nickname parsing) + v1.9 additions (R-017 / be2).
// DDL is transcribed verbatim from packages/contract/schema.sql (the single authority) —
// the v1.8 block plus the v1.9 block arch merged into this migration. Do not hand-edit the
// statements here: change schema.sql first, then this file, and test/r014 compares them.
// Run before workers in a stopped-write maintenance window. Refuse lossy downgrade.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

-- ===== v1.8（2026-09-07 arch；账户昵称解析主源 + 归属人工可改；migration 018 = R-017） =====
CREATE TABLE naming_rules (            -- 按渠道版本化的命名规范模板（快手/腾讯/字节各一套）
  workspace_id UUID NOT NULL, media TEXT NOT NULL, version INTEGER NOT NULL,
  segments JSONB NOT NULL,             -- [{key,label,order,source:enum|regex|free,values[],pattern,required,multi,mapsTo}]
  separators TEXT[] NOT NULL DEFAULT ARRAY['-'],   -- 允许的分隔符：半角/全角减号、下划线、空格…
  effective_from DATE NOT NULL, created_by UUID, note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, media, version)
);
CREATE TABLE account_name_parses (     -- 每个账户昵称的解析结果与人工确认
  workspace_id UUID NOT NULL, media TEXT NOT NULL, account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,          -- 解析时的原名（改名后重解析、留旧行做历史）
  rule_version INTEGER NOT NULL,
  status TEXT NOT NULL,                -- parsed|partial|failed|conflict|confirmed|overridden
  segments JSONB NOT NULL DEFAULT '{}'::jsonb,     -- 解析出的各段
  task_ids TEXT[],                     -- 业务段括号里的任务 ID（校验用，不直接写归属）
  conflicts JSONB,                     -- [{field, fromNickname, fromPlatform, source}]
  override JSONB,                      -- 人工改过的段；永远优先，重解析不覆盖
  parsed_at TIMESTAMPTZ DEFAULT now(), confirmed_by UUID, confirmed_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, media, account_id),
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE CASCADE
);

-- ===== v1.9（2026-09-07 arch；be2 九条缺口裁决；并入 migration 018 = R-017） =====
ALTER TABLE account_access_grants ADD COLUMN revoked_at TIMESTAMPTZ;   -- A7 交接：置位保留审计，不删行
ALTER TABLE account_access_grants ADD COLUMN revoked_by UUID;
ALTER TABLE alert_rules ADD COLUMN bound_at TIMESTAMPTZ;               -- 规则绑定时间；列落地前 DTO 允许 null
CREATE TABLE pool_status_daily_snapshot (  -- 账户池九态每日快照，供 deltaVsYesterday
  workspace_id UUID NOT NULL, media TEXT NOT NULL, account_id TEXT NOT NULL,
  ds DATE NOT NULL, pool_status TEXT NOT NULL,
  PRIMARY KEY (workspace_id, media, account_id, ds),
  FOREIGN KEY (workspace_id, media, account_id)
    REFERENCES accounts(workspace_id, media, account_id) ON DELETE CASCADE
);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM account_access_grants WHERE revoked_at IS NOT NULL OR revoked_by IS NOT NULL) THEN
        RAISE EXCEPTION 'account_access_grants carries revocation history; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM alert_rules WHERE bound_at IS NOT NULL) THEN
        RAISE EXCEPTION 'alert_rules carries binding timestamps; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM naming_rules) THEN
        RAISE EXCEPTION 'naming_rules still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM account_name_parses) THEN
        RAISE EXCEPTION 'account_name_parses still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM pool_status_daily_snapshot) THEN
        RAISE EXCEPTION 'pool_status_daily_snapshot still holds rows; cannot downgrade losslessly';
      END IF;
    END;
    $$;

    ALTER TABLE alert_rules DROP COLUMN bound_at;
    ALTER TABLE account_access_grants DROP COLUMN revoked_by, DROP COLUMN revoked_at;
    DROP TABLE pool_status_daily_snapshot;
    DROP TABLE account_name_parses;
    DROP TABLE naming_rules;
  `);
};
