-- Control-database route table for vendor-to-business-shard assignment.
-- Prerequisite: the control database has the current vendor table.
-- Apply to the control database only; business shards do not need this table.
-- Supply the SHA-256 of this exact file as psql variable migration_checksum.
\set ON_ERROR_STOP on
\if :{?migration_checksum}
\else
  \echo "Required: -v migration_checksum=<sha256 of this exact file>"
  \quit 2
\endif

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migration_history (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  checksum CHAR(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  installed_by TEXT NOT NULL DEFAULT current_user
);

SELECT set_config('app.migration_checksum', :'migration_checksum', true);

DO $check_migration$
DECLARE
  v_checksum CHAR(64) := current_setting('app.migration_checksum');
  v_applied_checksum CHAR(64);
BEGIN
  SELECT checksum INTO v_applied_checksum
    FROM schema_migration_history
   WHERE version = 'V2026111101';
  IF v_applied_checksum IS NOT NULL AND v_applied_checksum <> v_checksum THEN
    RAISE EXCEPTION 'Migration V2026111101 was already applied with a different checksum';
  END IF;
END
$check_migration$;

CREATE TABLE IF NOT EXISTS tenant_shard_registry (
  vendor_id BIGINT PRIMARY KEY REFERENCES vendor(id) ON DELETE CASCADE,
  shard_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_tenant_shard_registry_key
    CHECK (shard_key ~ '^shard_[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS ix_tenant_shard_registry_shard_key
  ON tenant_shard_registry (shard_key);

INSERT INTO schema_migration_history(version, description, checksum)
VALUES ('V2026111101', 'tenant shard registry', current_setting('app.migration_checksum'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
