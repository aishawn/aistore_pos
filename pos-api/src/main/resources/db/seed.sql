-- Optional sample data for the Orithos backend.
-- Run AFTER db/schema.sql. The admin user is auto-seeded by DataInitializer
-- (admin / 123456); this adds a little reference + demo data to browse.

-- Tax rates
INSERT INTO tax_rate (name, amount, is_default) VALUES
  ('GST', 10.0000, 1),
  ('GST Free', 0.0000, 0);

-- Payment methods
INSERT INTO payment_method (name, type) VALUES
  ('Cash', 'CASH'),
  ('EFTPOS', 'EFTPOS'),
  ('Gift Card', 'GIFT_CARD');

-- Classifications
INSERT INTO brand (name) VALUES
  ('Absolut'),
  ('Bacardi');
INSERT INTO category (name) VALUES
  ('Vodka'),
  ('Rum'),
  ('Beer Local');
INSERT INTO family (name) VALUES
  ('Spirits'),
  ('Beer'),
  ('Wine');
INSERT INTO tag (name) VALUES
  ('New Arrival'),
  ('On Sale'),
  ('Featured'),
  ('Clearance');

-- Suppliers
INSERT INTO supplier (name, status) VALUES
  ('Lion Nathan', 'ACTIVE'),
  ('CUB', 'ACTIVE'),
  ('Diageo', 'ACTIVE');

-- An outlet + register so sales/closures have a home
INSERT INTO outlet (name) VALUES ('Savvy Cellars Altona');
SET @outlet_id = LAST_INSERT_ID();
INSERT INTO register (name, outlet_id) VALUES
  ('Register #1', @outlet_id);

-- A couple of products + the Sell-pad quick key
INSERT INTO product (name, type, status, cost, case_quantity)
VALUES ('Absolut Vodka 1l', 'STANDARD', 'ACTIVE', 64.75, 1),
       ('Bacardi Carta Blanca 700ml', 'STANDARD', 'ACTIVE', 48.59, 1),
       ('Carlton Draught Btl 375ml', 'STANDARD', 'ACTIVE', 2.80, 24);

SET @carlton_id = LAST_INSERT_ID();
INSERT INTO product_price (product_id, quantity, price)
VALUES (@carlton_id, 1, 4.50);

-- A customer group + customer
INSERT INTO customer_group (name) VALUES
  ('default'),
  ('Loyalty Customers');
SET @group_id = LAST_INSERT_ID();
INSERT INTO customer (name, customer_group_id, current_owing)
VALUES ('Aliyah Roberts', @group_id, 0);

-- Default statement template
INSERT INTO statement (name) VALUES ('Statement');

-- Sample capped pricing rows (Provided + Imported)
INSERT INTO capped_price (product_id, source, source_type, price_set_name, start_date, end_date, quantity, capped_price)
SELECT p.id,
       'TC VIC Recommended Retail Pricing',
       'PROVIDED',
       'Default Price Set',
       '2026-03-26',
       '2026-12-31',
       1,
       CASE p.name
         WHEN 'Absolut Vodka 1l' THEN 89.99
         WHEN 'Bacardi Carta Blanca 700ml' THEN 69.99
         ELSE 16.99
       END
FROM product p
WHERE p.deleted_at IS NULL
LIMIT 3;

INSERT INTO capped_price (product_id, source, source_type, price_set_name, start_date, end_date, quantity, capped_price)
SELECT p.id,
       'Imported Price Cap File',
       'IMPORTED',
       'Default Price Set',
       '2026-01-01',
       '2026-12-31',
       1,
       12.99
FROM product p
WHERE p.name = 'Carlton Draught Btl 375ml'
LIMIT 1;
