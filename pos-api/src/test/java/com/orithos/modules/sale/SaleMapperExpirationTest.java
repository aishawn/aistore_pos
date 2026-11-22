package com.orithos.modules.sale;

import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SaleMapperExpirationTest {

    @Test
    void expirationSqlPreservesShopfrontParkedSales() {
        Configuration configuration = new Configuration();
        configuration.addMapper(SaleMapper.class);
        MappedStatement mapped = configuration.getMappedStatement(
                SaleMapper.class.getName() + ".expireParkedBefore");
        String sql = mapped.getBoundSql(Map.of(
                "expireBefore", LocalDate.of(2026, 11, 19),
                "createdBeforeUtc", LocalDateTime.of(2026, 11, 19, 0, 0)
        )).getSql().toLowerCase();

        assertTrue(sql.matches("(?s).*coalesce\\s*\\(\\s*(?:s\\.)?source_system\\s*,\\s*''\\s*\\)\\s*<>\\s*'shopfront'.*"),
                "parked-sale expiration must preserve source-of-truth Shopfront sales");
    }
}
