package com.orithos.modules.supplychain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PurchaseOptimizerTest {

    @Test
    void demandMatchesWeeklyFormula() {
        PurchaseOptimizer.DemandResult demand = PurchaseOptimizer.demand(
                new BigDecimal("18"), new BigDecimal("7"), new BigDecimal("2"),
                new BigDecimal("5"), new BigDecimal("0.15"));
        assertEquals(0, new BigDecimal("21").compareTo(demand.expectedDemand()));
        assertEquals(0, new BigDecimal("5").compareTo(demand.safetyStock()));
        assertEquals(0, new BigDecimal("17").compareTo(demand.rawQty()));
    }

    @Test
    void coveredStockDoesNotOrder() {
        assertNull(PurchaseOptimizer.demand(
                new BigDecimal("4"), new BigDecimal("20"), BigDecimal.ZERO,
                new BigDecimal("2"), BigDecimal.ZERO));
    }

    @Test
    void caseSizeRoundsSeventeenToEighteen() {
        PurchaseOptimizer.Normalized qty = PurchaseOptimizer.normalize(new BigDecimal("17"), new BigDecimal("6"), null);
        assertEquals(18, qty.units());
        assertEquals(3, qty.cases());
    }

    @Test
    void buyTenGetOneBeatsAHigherListPrice() {
        PurchaseOptimizer.DealRule deal = new PurchaseOptimizer.DealRule(
                "BUY_X_GET_Y", 10, 1, null, null, false, false, "Buy 10 get 1");
        PurchaseOptimizer.CostQuote metcash = PurchaseOptimizer.cost(11, new BigDecimal("120"), BigDecimal.ZERO, null);
        PurchaseOptimizer.CostQuote alm = PurchaseOptimizer.cost(11, new BigDecimal("125"), BigDecimal.ZERO, deal);
        assertEquals(0, new BigDecimal("1320.00").compareTo(metcash.total()));
        assertEquals(0, new BigDecimal("1250.00").compareTo(alm.total()));
        assertTrue(alm.effectivePerCase().compareTo(new BigDecimal("113.64")) < 0);
        assertTrue(alm.total().compareTo(metcash.total()) < 0);
    }

    @Test
    void lockedSupplierIsNotCompared() {
        PurchaseOptimizer.Pick pick = PurchaseOptimizer.choose(1L, List.of(option(1, "Metcash", "100.00"), option(2, "ALM", "90.00")),
                1L, null, null);
        assertEquals(1L, pick.supplierId());
    }

    @Test
    void preferredSupplierStaysUntilThreshold() {
        List<PurchaseOptimizer.SupplierOption> options = List.of(option(1, "Metcash", "120.00"), option(2, "ALM", "100.00"));
        PurchaseOptimizer.Pick kept = PurchaseOptimizer.choose(1L, options, null, 1L, new BigDecimal("25"));
        assertEquals(1L, kept.supplierId());
        PurchaseOptimizer.Pick switched = PurchaseOptimizer.choose(1L, options, null, 1L, new BigDecimal("15"));
        assertEquals(2L, switched.supplierId());
        assertTrue(switched.decision().startsWith("Switch supplier"));
    }

    @Test
    void unusualQuantityIsFlagged() {
        assertTrue(PurchaseOptimizer.unusual(new BigDecimal("10"), 60));
        assertFalse(PurchaseOptimizer.unusual(new BigDecimal("18"), 18));
    }

    @Test
    void mixAndMatchMovesTheBasketWhenTheDiscountWins() {
        PurchaseOptimizer.Pick a = PurchaseOptimizer.Pick.priced(1L, option(1, "X", "100.00", 6), "list",
                List.of(option(1, "X", "100.00", 6), option(2, "Metcash", "102.00", 6)));
        PurchaseOptimizer.Pick b = PurchaseOptimizer.Pick.priced(2L, option(1, "X", "50.00", 3), "list",
                List.of(option(1, "X", "50.00", 3), option(2, "Metcash", "51.00", 3)));
        PurchaseOptimizer.Pick c = PurchaseOptimizer.Pick.priced(3L, option(1, "X", "40.00", 2), "list",
                List.of(option(1, "X", "40.00", 2), option(2, "Metcash", "41.00", 2)));
        List<PurchaseOptimizer.Pick> moved = PurchaseOptimizer.applyBaskets(List.of(a, b, c), List.of(
                new PurchaseOptimizer.BasketDeal(2L, new BigDecimal("5"), 10, Set.of(), "Buy 10 cases 5% off", false)));
        assertEquals(2L, moved.get(0).supplierId());
        assertEquals(2L, moved.get(1).supplierId());
        assertEquals(2L, moved.get(2).supplierId());
        assertTrue(moved.get(0).decision().startsWith("Mix & match"));
    }

    private static PurchaseOptimizer.SupplierOption option(long id, String name, String casePrice) {
        return option(id, name, casePrice, 1);
    }

    private static PurchaseOptimizer.SupplierOption option(long id, String name, String casePrice, int cases) {
        BigDecimal price = new BigDecimal(casePrice);
        PurchaseOptimizer.CostQuote cost = PurchaseOptimizer.cost(cases, price, BigDecimal.ZERO, null);
        return new PurchaseOptimizer.SupplierOption(id, name, null, "SKU", cases == 0 ? 1 : 1,
                cases, cases, price, BigDecimal.ZERO, "PRICE_FILE", cost);
    }
}
