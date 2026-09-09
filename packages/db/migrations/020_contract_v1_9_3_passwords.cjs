// Contract v1.9.3: self-service password change for the internal test login (migration 020 = be2).
// DDL is transcribed verbatim from packages/contract/schema.sql (the single authority); the slice
// runs from the v1.9.3 marker to the business-object section header. Backticks inside the copied
// comments are escaped because this sits in a JS template literal — the SQL itself is unchanged.
// Do not hand-edit the statements here: change schema.sql first, then this file; test/r014 compares
// them. Run before workers in a stopped-write maintenance window. Refuse lossy downgrade.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

-- v1.9.3（2026-09-09 arch 裁 be2 Q-021 ①，migration 020 = be2）：内测账密期自助改密的落点。
-- 登录校验先查本表，无行回落 ENV \`INTERNAL_TEST_AUTH_CREDENTIALS_JSON\`（ENV 降级为首次引导凭证）；只对 provider=internal_test。
CREATE TABLE identity_passwords (
  identity_id UUID PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
  password_salt TEXT NOT NULL,
  password_scrypt TEXT NOT NULL,
  algo TEXT NOT NULL DEFAULT 'scrypt',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM identity_passwords) THEN
        -- 回滚会把自助改过的密码全丢掉，那些人只能回到 ENV 里的引导密码——
        -- 而 ENV 密码可能早就换了，等于把他们锁在门外。有行就拒。
        RAISE EXCEPTION 'identity_passwords still holds rows; cannot downgrade losslessly';
      END IF;
    END;
    $$;

    DROP TABLE identity_passwords;
  `);
};
