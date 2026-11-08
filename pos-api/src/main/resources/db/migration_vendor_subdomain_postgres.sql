ALTER TABLE vendor ADD COLUMN IF NOT EXISTS subdomain VARCHAR(63);
ALTER TABLE vendor ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';

INSERT INTO vendor (id, name, subdomain, status, created_at, updated_at, outlet_id)
SELECT 1, 'Orithos Demo', 'demo', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
WHERE NOT EXISTS (SELECT 1 FROM vendor WHERE id = 1);

UPDATE vendor SET subdomain = 'demo' WHERE id = 1 AND (subdomain IS NULL OR subdomain = '' OR subdomain = 'default');
UPDATE vendor SET name = 'Orithos Demo' WHERE id = 1 AND (name IS NULL OR name = '');
UPDATE vendor SET status = 'active' WHERE status IS NULL OR status = '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_subdomain ON vendor (subdomain);

ALTER TABLE outlet ADD COLUMN IF NOT EXISTS vendor_id BIGINT;
UPDATE outlet SET vendor_id = 1 WHERE vendor_id IS NULL;
ALTER TABLE outlet ALTER COLUMN vendor_id SET DEFAULT 1;
ALTER TABLE outlet ALTER COLUMN vendor_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outlet_vendor ON outlet (vendor_id);

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS vendor_id BIGINT;
UPDATE app_user SET vendor_id = 1 WHERE vendor_id IS NULL;
ALTER TABLE app_user ALTER COLUMN vendor_id SET DEFAULT 1;
ALTER TABLE app_user ALTER COLUMN vendor_id SET NOT NULL;
DROP INDEX IF EXISTS uq_user_username;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_vendor_username ON app_user (vendor_id, username);
CREATE INDEX IF NOT EXISTS idx_app_user_vendor ON app_user (vendor_id);
