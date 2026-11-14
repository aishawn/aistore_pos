package com.orithos.config;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class SaleItemSalesLookupSchemaMigratorTest {
    @Test
    void createsIdempotentConcurrentSaleItemLookupIndex() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);

        new SaleItemSalesLookupSchemaMigrator(jdbc).run();

        verify(jdbc).execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_item_sale_outlet "
                + "ON sale_item (sale_id, outlet_id)");
        verify(jdbc).execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_payment_sale_outlet "
                + "ON sale_payment (sale_id, outlet_id)");
        verify(jdbc).execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_outlet_source_external_id "
                + "ON sale (outlet_id, source_system, external_id, id)");
    }
}
