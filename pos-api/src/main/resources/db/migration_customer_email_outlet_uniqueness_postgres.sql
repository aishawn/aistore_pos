-- Allow the same Shopfront customer email to exist in separate Orithos outlets.
ALTER TABLE customer_email DROP CONSTRAINT IF EXISTS uq_customer_email_active;
DROP INDEX IF EXISTS uq_customer_email_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_email_outlet_active
  ON customer_email (outlet_id, active_email);
