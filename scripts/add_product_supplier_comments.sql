# product_supplier column comments (Chinese)
SET NAMES utf8mb4;

ALTER TABLE product_supplier
  MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键';

ALTER TABLE product_supplier
  MODIFY COLUMN product_id BIGINT NOT NULL COMMENT '商品 ID，关联 product.id';

ALTER TABLE product_supplier
  MODIFY COLUMN supplier_id BIGINT NOT NULL COMMENT '供应商 ID，关联 supplier.id';

ALTER TABLE product_supplier
  MODIFY COLUMN code VARCHAR(128) NULL COMMENT '供应商商品编码（SKU）';

ALTER TABLE product_supplier
  MODIFY COLUMN minimum_order_quantity INT NULL COMMENT '该供应商最小订货量';
