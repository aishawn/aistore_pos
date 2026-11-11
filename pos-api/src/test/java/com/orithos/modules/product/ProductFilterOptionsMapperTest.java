package com.orithos.modules.product;

import com.orithos.modules.product.mapper.ProductMapper;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * PostgreSQL {@code CAST(id AS CHAR)} is {@code character(1)} and truncates multi-digit ids
 * (e.g. category 13 → "1"), which breaks Manage Categories / product filters.
 */
class ProductFilterOptionsMapperTest {

    private Configuration configuration;

    @BeforeEach
    void setUp() {
        configuration = new Configuration();
        configuration.addMapper(ProductMapper.class);
    }

    @Test
    void filterOptionQueriesCastIdsAsTextAndScopeToOutlet() {
        for (String method : List.of(
                "listBrandFilterOptions",
                "listCategoryFilterOptions",
                "listFamilyFilterOptions",
                "listTagFilterOptions",
                "listSupplierFilterOptions",
                "listTaxRateFilterOptions",
                "listCostTaxRateFilterOptions")) {
            String sql = boundSql(method).toLowerCase();
            assertFalse(sql.contains("as char"), method + " must not use CAST(... AS CHAR)");
            assertTrue(sql.contains("as text"), method + " must CAST ids AS TEXT for PostgreSQL");
            assertTrue(sql.contains("vendor_id"), method + " must scope by vendor");
            assertTrue(sql.contains("outlet_id") || sql.contains("o.id = #{outletid}"),
                    method + " must scope by outlet");
        }
        String typeSql = boundSql("listTypeFilterOptions").toLowerCase();
        assertTrue(typeSql.contains("vendor_id"));
        assertTrue(typeSql.contains("outlet_id") || typeSql.contains("o.id = #{outletid}"));
    }

    private String boundSql(String method) {
        MappedStatement mapped = configuration.getMappedStatement(
                ProductMapper.class.getName() + "." + method);
        return mapped.getBoundSql(Map.of("vendorId", 1L, "outletId", 1L)).getSql();
    }
}
