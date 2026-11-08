ALTER TABLE sale_item
    ADD COLUMN IF NOT EXISTS refund_of_sale_item_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_item_refund_source
    ON sale_item(refund_of_sale_item_id)
    WHERE refund_of_sale_item_id IS NOT NULL;
