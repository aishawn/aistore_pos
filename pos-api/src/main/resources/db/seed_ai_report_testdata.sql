-- AI 报表测试数据（可重复执行）。
-- 相对 CURDATE() 造单，保证「今天 / 昨天 / 上周五 / 上周 / 上个月」总能查到数。
--
--   psql "$POSTGRESQL_URL" -f src/main/resources/db/seed_ai_report_testdata.sql
--
-- 期望（outlet_id=1，只计 COMPLETED；单价 Carlton $6 / Coca Cola $3.50）：
--   今天销售额     $33.50   3 笔  6 件   客单 $11.17
--   昨天销售额     $31.00   2 笔  6 件   客单 $15.50
--   上周五销售额   $60.00   2 笔 10 件   全是啤酒
--   上周销售额     $72.00   3 笔 12 件   （含上周五 + 上周一）
--   上个月销售额  $120.00   4 笔 20 件   客单 $30.00
--   Coca Cola 库存  200
--   Carlton 库存     88
--   滞销：Orithos Test Dead Stock Whisky（36）以及其它有库存无近期销售的商品

SET @outlet := 1;
SET @today := CURDATE();
SET @yesterday := DATE_SUB(@today, INTERVAL 1 DAY);
SET @wd := WEEKDAY(@today);
SET @last_friday := DATE_SUB(@today, INTERVAL IF((@wd + 3) % 7 = 0, 7, (@wd + 3) % 7) DAY);
SET @last_week_mon := DATE_SUB(@today, INTERVAL @wd + 7 DAY);
SET @last_month_mid := DATE_ADD(DATE_FORMAT(DATE_SUB(@today, INTERVAL 1 MONTH), '%Y-%m-01'), INTERVAL 14 DAY);

-- 清掉上次种子单
DELETE si FROM sale_item si
INNER JOIN sale s ON s.id = si.sale_id
WHERE s.invoice_id LIKE 'AI-RPT-SEED%';
DELETE FROM sale WHERE invoice_id LIKE 'AI-RPT-SEED%';

-- 分类（已有则复用）
INSERT INTO category (name, outlet_id)
SELECT 'Beer Local', @outlet FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM category WHERE name = 'Beer Local' AND outlet_id = @outlet AND deleted_at IS NULL
);
SET @beer_cat := (
  SELECT id FROM category
  WHERE name = 'Beer Local' AND outlet_id = @outlet AND deleted_at IS NULL
  ORDER BY id LIMIT 1
);

-- 商品
INSERT INTO product (name, type, status, description, category_id, case_quantity, track_inventory, outlet_id)
SELECT 'Carlton Draught Btl 375ml', 'STANDARD', 'ACTIVE', 'AI report seed beer', @beer_cat, 24, 1, @outlet
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM product WHERE name = 'Carlton Draught Btl 375ml' AND deleted_at IS NULL
);

INSERT INTO product (name, type, status, description, category_id, case_quantity, track_inventory, outlet_id)
SELECT 'Orithos Test Coca Cola 375ml', 'STANDARD', 'ACTIVE', 'AI report seed cola', NULL, 24, 1, @outlet
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM product WHERE name = 'Orithos Test Coca Cola 375ml' AND deleted_at IS NULL
);

INSERT INTO product (name, type, status, description, category_id, case_quantity, track_inventory, outlet_id)
SELECT 'Orithos Test Dead Stock Whisky', 'STANDARD', 'ACTIVE', 'AI report seed dead stock', NULL, 6, 1, @outlet
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM product WHERE name = 'Orithos Test Dead Stock Whisky' AND deleted_at IS NULL
);

INSERT INTO product (name, type, status, description, category_id, case_quantity, track_inventory, outlet_id)
SELECT 'Coastal Range Session Ale 376ml', 'STANDARD', 'ACTIVE', 'AI report seed stock', @beer_cat, 12, 1, @outlet
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM product WHERE name = 'Coastal Range Session Ale 376ml' AND deleted_at IS NULL
);

SET @p_beer := (SELECT id FROM product WHERE name = 'Carlton Draught Btl 375ml' AND deleted_at IS NULL LIMIT 1);
SET @p_cola := (SELECT id FROM product WHERE name = 'Orithos Test Coca Cola 375ml' AND deleted_at IS NULL LIMIT 1);
SET @p_dead := (SELECT id FROM product WHERE name = 'Orithos Test Dead Stock Whisky' AND deleted_at IS NULL LIMIT 1);
SET @p_ale  := (SELECT id FROM product WHERE name = 'Coastal Range Session Ale 376ml' AND deleted_at IS NULL LIMIT 1);

-- 库存（覆盖写入，方便「还有多少库存」稳定出数）
INSERT INTO product_inventory (product_id, outlet_id, quantity, on_order)
VALUES
  (@p_beer, @outlet, 88, 0),
  (@p_cola, @outlet, 200, 0),
  (@p_dead, @outlet, 36, 0),
  (@p_ale,  @outlet, 105, 0)
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), on_order = VALUES(on_order);

-- Times stay near midday so JDBC UTC conversion cannot push them out of "today".
-- Tenant is sale.outlet_id; do not set register_id (machine id is unused).
-- 今天：$12 + $3.50 + $18 = $33.50
INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-TODAY-1', 2, 12.00, 0.00, CONCAT(@today, ' 11:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 2, 6.00, 12.00, @outlet);

INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-TODAY-2', 1, 3.50, 0.00, CONCAT(@today, ' 12:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_cola, 1, 3.50, 3.50, @outlet);

INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-TODAY-3', 3, 18.00, 0.00, CONCAT(@today, ' 13:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 3, 6.00, 18.00, @outlet);

-- 昨天：$24 + $7 = $31.00
INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-YDAY-1', 4, 24.00, 0.00, CONCAT(@yesterday, ' 11:20:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 4, 6.00, 24.00, @outlet);

INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-YDAY-2', 2, 7.00, 0.00, CONCAT(@yesterday, ' 12:50:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_cola, 2, 3.50, 7.00, @outlet);

-- 上周五：啤酒 10 件 $60
INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-LFRIDAY-1', 5, 30.00, 0.00, CONCAT(@last_friday, ' 12:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 5, 6.00, 30.00, @outlet);

INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-LFRIDAY-2', 5, 30.00, 0.00, CONCAT(@last_friday, ' 13:30:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 5, 6.00, 30.00, @outlet);

-- 上周一（落在「上周」，且通常不在「上周五」）
INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-LWEEK-1', 2, 12.00, 0.00, CONCAT(@last_week_mon, ' 11:45:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 2, 6.00, 12.00, @outlet);

-- 上个月中旬：4 笔 × $30 = $120
INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-LMONTH-1', 5, 30.00, 0.00, CONCAT(@last_month_mid, ' 11:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 5, 6.00, 30.00, @outlet);

INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-LMONTH-2', 5, 30.00, 0.00, CONCAT(@last_month_mid, ' 12:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 5, 6.00, 30.00, @outlet);

INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-LMONTH-3', 5, 30.00, 0.00, CONCAT(@last_month_mid, ' 13:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 5, 6.00, 30.00, @outlet);

INSERT INTO sale (status, invoice_id, total_quantity, total_price, outstanding, created_at, updated_at, outlet_id)
VALUES ('COMPLETED', 'AI-RPT-SEED-LMONTH-4', 5, 30.00, 0.00, CONCAT(@last_month_mid, ' 14:00:00'), NOW(), @outlet);
INSERT INTO sale_item (sale_id, product_id, quantity, base_price, total_price, outlet_id)
VALUES (LAST_INSERT_ID(), @p_beer, 5, 6.00, 30.00, @outlet);

SELECT
  'seeded' AS status,
  (SELECT COUNT(*) FROM sale WHERE invoice_id LIKE 'AI-RPT-SEED%') AS sale_count,
  @today AS today,
  @yesterday AS yesterday,
  @last_friday AS last_friday,
  @last_week_mon AS last_week_monday,
  @last_month_mid AS last_month_mid;
