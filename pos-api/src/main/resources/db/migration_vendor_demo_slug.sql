-- Rename the legacy pilot store slug from "default" to "demo"
-- so the store is addressed at https://demo.orithos.com.au while
-- https://app.orithos.com.au remains the control-plane console.
-- Idempotent: only rewrites subdomain = 'default' when 'demo' is free.

UPDATE vendor
SET subdomain = 'demo',
    name = CASE
      WHEN name IS NULL OR name = '' OR name = 'Default' THEN 'Orithos Demo'
      ELSE name
    END
WHERE subdomain = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM (
      SELECT id FROM vendor WHERE subdomain = 'demo' LIMIT 1
    ) AS existing_demo
  );
