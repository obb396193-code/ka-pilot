// Contract v1.4 knowledge base (8.x). The four kb tables were specified in schema.sql from
// the start but never landed in any migration — only in the reference file
// migrations/sql/001_contract_v1.sql — so no database has ever had them.
// DDL is transcribed verbatim from packages/contract/schema.sql (the single authority),
// slice markers `-- ── 8.x 知识库` → `-- ── 9.4 卡片中心`. Do not hand-edit the statements
// here: change schema.sql first, then this file; test/r014 compares them statement by statement.
// Run before workers in a stopped-write maintenance window. Refuse lossy downgrade.
exports.up = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';

-- ── 8.x 知识库（对齐 CR knowledge_items/document_links 命名 + B8 领域底座；前端复制 CR 代码时字段直接对上）
CREATE TABLE kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'manual',    -- manual|ai_report|case|sop
  parent_id UUID REFERENCES kb_documents(id), position TEXT,   -- 文档树
  content_json JSONB,                     -- BlockNote blocks = 真相源（CR 同名）
  content_text TEXT,                      -- 纯文本投影，搜索用（CR 同名）
  content_fingerprint TEXT,
  tags TEXT[], owner UUID,
  visibility TEXT DEFAULT 'private',      -- private|team|workspace；错题本默认 private
  source_ref JSONB,                       -- ai_report/case 来源 {type,id}
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE kb_revisions (
  id BIGSERIAL PRIMARY KEY, document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  revision INT NOT NULL, content_json JSONB, edited_by UUID, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (document_id, revision)
);
CREATE TABLE kb_links (                  -- @双链（CR document_links 同构）
  workspace_id UUID NOT NULL,
  source_document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (source_document_id, target_document_id)
);
CREATE TABLE kb_business_refs (          -- 8.4 按对象反查
  workspace_id UUID NOT NULL, document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,              -- account|task|changeset|work_item|material
  object_id TEXT NOT NULL, media TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (document_id, object_type, object_id)
);
CREATE INDEX idx_kb_documents_fts ON kb_documents
  USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content_text,'')));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    SET LOCAL lock_timeout = '5s';
    SET LOCAL statement_timeout = '5min';
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM kb_documents) THEN
        RAISE EXCEPTION 'kb_documents still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM kb_revisions) THEN
        RAISE EXCEPTION 'kb_revisions still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM kb_links) THEN
        RAISE EXCEPTION 'kb_links still holds rows; cannot downgrade losslessly';
      END IF;
      IF EXISTS (SELECT 1 FROM kb_business_refs) THEN
        RAISE EXCEPTION 'kb_business_refs still holds rows; cannot downgrade losslessly';
      END IF;
    END;
    $$;

    DROP TABLE kb_business_refs;
    DROP TABLE kb_links;
    DROP TABLE kb_revisions;
    DROP TABLE kb_documents;
  `);
};
