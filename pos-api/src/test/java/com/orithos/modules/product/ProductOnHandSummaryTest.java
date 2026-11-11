package com.orithos.modules.product;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ProductOnHandSummaryTest {

    @Test
    void defaultsRemainNullUntilMapperPopulates() {
        ProductOnHandSummary summary = new ProductOnHandSummary();
        assertEquals(0L, summary.getProductCount());
        assertNull(summary.getCaseLevelTotal());
        assertNull(summary.getItemLevelTotal());
        assertNull(summary.getValueIncLastTotal());
    }

    @Test
    void storesFullCatalogTotals() {
        ProductOnHandSummary summary = new ProductOnHandSummary();
        summary.setProductCount(10802L);
        summary.setCaseLevelTotal(new BigDecimal("151"));
        summary.setItemLevelTotal(new BigDecimal("1558"));
        summary.setValueIncLastTotal(new BigDecimal("390107.42"));
        assertEquals(10802L, summary.getProductCount());
        assertEquals(new BigDecimal("151"), summary.getCaseLevelTotal());
        assertEquals(new BigDecimal("1558"), summary.getItemLevelTotal());
        assertEquals(new BigDecimal("390107.42"), summary.getValueIncLastTotal());
    }
}
