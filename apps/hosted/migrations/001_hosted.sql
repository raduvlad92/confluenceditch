CREATE TABLE IF NOT EXISTS cd_connections (
 id uuid PRIMARY KEY, user_id text NOT NULL, mode text NOT NULL CHECK(mode IN ('live','demo')),
 credentials text NOT NULL, public jsonb NOT NULL, account_id text,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 revoked_at timestamptz, purged boolean NOT NULL DEFAULT false,
 UNIQUE(id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS cd_active_connection ON cd_connections(user_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS cd_captures (
 id uuid PRIMARY KEY, user_id text NOT NULL, connection_id uuid NOT NULL,
 command_id uuid NOT NULL, fingerprint text NOT NULL, selection jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','ready','ready_with_gaps','failed','cancelled')),
 progress jsonb NOT NULL, generation integer NOT NULL DEFAULT 0,
 artifact_prefix text, error text, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 FOREIGN KEY(connection_id,user_id) REFERENCES cd_connections(id,user_id),
 UNIQUE(user_id,command_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS cd_one_active_capture ON cd_captures(user_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS cd_capture_user_date ON cd_captures(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS cd_connection_expiry ON cd_connections(expires_at) WHERE purged=false;
CREATE INDEX IF NOT EXISTS cd_capture_date ON cd_captures(created_at DESC);
