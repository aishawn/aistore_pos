-- Run once on existing databases to support multiple customer emails.
CREATE TABLE IF NOT EXISTS customer_email (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  email       VARCHAR(255) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_customer_email_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill primary emails from customer.email
INSERT INTO customer_email (customer_id, email, sort_order)
SELECT c.id, TRIM(c.email), 0
FROM customer c
WHERE c.email IS NOT NULL
  AND TRIM(c.email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM customer_email ce WHERE ce.customer_id = c.id
  );
