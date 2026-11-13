DO $$
BEGIN
    ALTER TABLE product_inventory
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL;
    ALTER TABLE product_inventory
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

    EXECUTE $function$
        CREATE OR REPLACE FUNCTION set_product_inventory_updated_at()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $body$
        BEGIN
            NEW.updated_at := CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $body$
    $function$;

    DROP TRIGGER IF EXISTS trg_product_inventory_updated_at ON product_inventory;
    CREATE TRIGGER trg_product_inventory_updated_at
        BEFORE UPDATE ON product_inventory
        FOR EACH ROW
        EXECUTE FUNCTION set_product_inventory_updated_at();
END;
$$;
