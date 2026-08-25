exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
      ADD CONSTRAINT users_workspace_id_id_key UNIQUE (workspace_id, id);

    CREATE TABLE auth_identities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT auth_identities_provider_ck
        CHECK (provider IN ('internal_test', 'buc')),
      CONSTRAINT auth_identities_subject_ck
        CHECK (btrim(provider_subject) <> ''),
      CONSTRAINT auth_identities_display_name_ck
        CHECK (btrim(display_name) <> ''),
      CONSTRAINT auth_identities_provider_subject_key
        UNIQUE (provider, provider_subject)
    );

    CREATE TABLE workspace_memberships (
      workspace_id UUID NOT NULL,
      identity_id UUID NOT NULL,
      user_id UUID NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, identity_id),
      CONSTRAINT workspace_memberships_workspace_fk
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT workspace_memberships_identity_fk
        FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT workspace_memberships_user_fk
        FOREIGN KEY (workspace_id, user_id) REFERENCES users(workspace_id, id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT workspace_memberships_role_ck
        CHECK (role IN ('optimizer', 'operator', 'lead', 'admin')),
      CONSTRAINT workspace_memberships_workspace_user_key
        UNIQUE (workspace_id, user_id)
    );

    CREATE TABLE auth_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id UUID NOT NULL,
      active_workspace_id UUID NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT auth_sessions_identity_fk
        FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT auth_sessions_active_membership_fk
        FOREIGN KEY (active_workspace_id, identity_id)
        REFERENCES workspace_memberships(workspace_id, identity_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT auth_sessions_token_hash_key UNIQUE (token_hash),
      CONSTRAINT auth_sessions_token_hash_ck
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT auth_sessions_expiry_ck CHECK (expires_at > created_at),
      CONSTRAINT auth_sessions_revoked_at_ck
        CHECK (revoked_at IS NULL OR revoked_at >= created_at),
      CONSTRAINT auth_sessions_last_seen_at_ck CHECK (last_seen_at >= created_at)
    );

    CREATE TABLE account_access_grants (
      workspace_id UUID NOT NULL,
      identity_id UUID NOT NULL,
      media TEXT NOT NULL,
      account_id TEXT NOT NULL,
      access_level TEXT NOT NULL DEFAULT 'read',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, identity_id, media, account_id),
      CONSTRAINT account_access_grants_membership_fk
        FOREIGN KEY (workspace_id, identity_id)
        REFERENCES workspace_memberships(workspace_id, identity_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT account_access_grants_account_fk
        FOREIGN KEY (workspace_id, media, account_id)
        REFERENCES accounts(workspace_id, media, account_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT account_access_grants_media_ck CHECK (btrim(media) <> ''),
      CONSTRAINT account_access_grants_account_ck CHECK (btrim(account_id) <> ''),
      CONSTRAINT account_access_grants_access_level_ck
        CHECK (access_level IN ('read', 'preview', 'execute'))
    );

    CREATE INDEX idx_workspace_memberships_identity
      ON workspace_memberships(identity_id, is_active, workspace_id);
    CREATE INDEX idx_account_access_grants_identity
      ON account_access_grants(identity_id, workspace_id, media, account_id);
    CREATE INDEX idx_auth_sessions_identity
      ON auth_sessions(identity_id, expires_at)
      WHERE revoked_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE account_access_grants;
    DROP TABLE auth_sessions;
    DROP TABLE workspace_memberships;
    DROP TABLE auth_identities;
    ALTER TABLE users DROP CONSTRAINT users_workspace_id_id_key;
  `);
};
