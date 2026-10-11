-- Add test user (test / 123456) with the same admin privileges as admin.
-- password_hash is BCrypt for "123456" (same as the default admin account).

INSERT INTO app_user (
  name,
  username,
  password_hash,
  email,
  phone,
  image,
  role_id,
  is_admin,
  is_api_user,
  dark_mode,
  pending_password_reset
)
SELECT
  'test',
  'test',
  '$2a$10$BkFDmnWH7lTz7smD6cM0tOA7RPqh5b0p/8UMGHPPcOJkED8.7xHHW',
  NULL,
  NULL,
  NULL,
  NULL,
  1,
  0,
  'default',
  0
WHERE NOT EXISTS (
  SELECT 1 FROM app_user WHERE username = 'test' AND deleted_at IS NULL
);

-- If test already exists, ensure admin flag + password match admin defaults:
UPDATE app_user
SET
  name = 'test',
  password_hash = '$2a$10$BkFDmnWH7lTz7smD6cM0tOA7RPqh5b0p/8UMGHPPcOJkED8.7xHHW',
  role_id = NULL,
  is_admin = 1,
  is_api_user = 0,
  dark_mode = 'default',
  pending_password_reset = 0,
  deleted_at = NULL
WHERE username = 'test';
