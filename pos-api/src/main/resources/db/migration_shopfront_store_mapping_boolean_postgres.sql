DO $$
DECLARE
    enabled_type TEXT;
BEGIN
    CREATE TABLE IF NOT EXISTS shopfront_store_mapping (
        store_key VARCHAR(64) NOT NULL PRIMARY KEY,
        shopfront_outlet VARCHAR(255),
        company_id VARCHAR(128) NOT NULL,
        outlet_id VARCHAR(128) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE
    );

    SELECT data_type
      INTO enabled_type
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'shopfront_store_mapping'
       AND column_name = 'enabled';

    IF enabled_type = 'boolean' THEN
        RETURN;
    ELSIF enabled_type IN ('smallint', 'integer', 'bigint') THEN
        ALTER TABLE shopfront_store_mapping
            ALTER COLUMN enabled DROP DEFAULT;
        ALTER TABLE shopfront_store_mapping
            ALTER COLUMN enabled TYPE BOOLEAN USING enabled <> 0;
        ALTER TABLE shopfront_store_mapping
            ALTER COLUMN enabled SET DEFAULT TRUE;
    ELSE
        RAISE EXCEPTION 'Unsupported shopfront_store_mapping.enabled type: %', enabled_type;
    END IF;
END $$;
