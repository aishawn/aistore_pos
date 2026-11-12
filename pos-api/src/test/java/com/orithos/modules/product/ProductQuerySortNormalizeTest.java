package com.orithos.modules.product;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ProductQuerySortNormalizeTest {

    @Test
    void defaultsToShopfrontNameAscending() {
        ProductQuery query = new ProductQuery();
        query.normalize();
        assertEquals("name", query.getSortBy());
        assertEquals("asc", query.getSortDirection());
    }

    @Test
    void acceptsCreatedAtAndDescAliases() {
        assertEquals("created_at", ProductQuery.normalizeSortBy("newest"));
        assertEquals("created_at", ProductQuery.normalizeSortBy("created_at"));
        assertEquals("name", ProductQuery.normalizeSortBy("product"));
        assertEquals("name", ProductQuery.normalizeSortBy("weird"));
        assertEquals("desc", ProductQuery.normalizeSortDirection("DESC"));
        assertEquals("asc", ProductQuery.normalizeSortDirection("ASC"));
        assertEquals("asc", ProductQuery.normalizeSortDirection("nope"));
    }
}
