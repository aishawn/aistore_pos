package com.orithos.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(33)
public class SaleItemSalesLookupSchemaMigrator implements CommandLineRunner {
    private final JdbcTemplate jdbc;

    public SaleItemSalesLookupSchemaMigrator(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        jdbc.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_item_sale_outlet "
                + "ON sale_item (sale_id, outlet_id)");
    }
}
