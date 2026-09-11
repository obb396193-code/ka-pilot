// Contract v1.9.8 (be2 Q-022 ③): Chinese search needs trigram support.
//
// arch 的裁决原文说「019 加扩展 + 索引」，但 019 已经合进 main 并在联调库应用过 ——
// 回头改一个已应用的迁移不会在任何库上重跑，等于没做。所以另起 022（021 是 Codex 的
// account_metrics_hourly）。schema.sql 目前没有这两行，已在回执请 arch 同步，
// 这里的 DDL 依据是 api.md v1.9.8。
//
// 扩展装不上时**不让整批迁移失败**：索引建不了就不建，搜索侧有 ILIKE 双通路兜底并
// 在 meta.warnings 标 TRGM_MISSING。装扩展要权限，卡住整个部署不值当。
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    DO $$
    BEGIN
      BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
      EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
        RAISE NOTICE 'pg_trgm unavailable; kb search stays on the ILIKE path';
      END;

      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        CREATE INDEX IF NOT EXISTS idx_kb_documents_title_trgm
          ON kb_documents USING gin (title gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS idx_kb_documents_content_trgm
          ON kb_documents USING gin (content_text gin_trgm_ops);
      END IF;
    END;
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

    DROP INDEX IF EXISTS idx_kb_documents_content_trgm;
    DROP INDEX IF EXISTS idx_kb_documents_title_trgm;
    -- 扩展不删：别的表/别的批次可能也在用它，回滚一个搜索索引不该顺手卸掉共享扩展。
  `);
};
