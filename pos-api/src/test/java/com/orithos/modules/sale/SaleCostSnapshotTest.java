package com.orithos.modules.sale;

import com.orithos.modules.product.Product;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class SaleCostSnapshotTest {

    @Test
    void capturesKnownUnitCostForNewPosSale() {
        Product product = new Product();
        product.setCost(new BigDecimal("2.3750"));

        assertEquals(0, SaleCostSnapshot.knownUnitCost(product).compareTo(new BigDecimal("2.3750")));
    }

    @Test
    void doesNotTreatPercentageCostAsCurrency() {
        Product product = new Product();
        product.setCost(new BigDecimal("30"));
        product.setCostPercentage(true);

        assertNull(SaleCostSnapshot.knownUnitCost(product));
    }

    @Test
    void doesNotCaptureUnconfirmedShopfrontCostWithoutCaseCostEvidence() {
        Product product = new Product();
        product.setCost(new BigDecimal("2.50"));
        product.setShopfrontSourceUpdatedAt("2026-11-20T10:00:00Z");
        product.setShopfrontCatalogConfirmed(false);

        assertNull(SaleCostSnapshot.knownUnitCost(product));
    }

    @Test
    void capturesShopfrontCostWhenCaseCostEvidenceExists() {
        Product product = new Product();
        product.setCost(new BigDecimal("2.50"));
        product.setCaseCost(new BigDecimal("30.00"));
        product.setCaseQuantity(new BigDecimal("12"));
        product.setShopfrontSourceUpdatedAt("2026-11-20T10:00:00Z");

        assertEquals(0, SaleCostSnapshot.knownUnitCost(product).compareTo(new BigDecimal("2.50")));
    }
}
