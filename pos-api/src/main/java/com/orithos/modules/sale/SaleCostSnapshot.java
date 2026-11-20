package com.orithos.modules.sale;

import com.orithos.modules.product.Product;

import java.math.BigDecimal;

final class SaleCostSnapshot {
    private SaleCostSnapshot() {}

    static BigDecimal knownUnitCost(Product product) {
        if (product == null || Boolean.TRUE.equals(product.getCostPercentage())) return null;
        BigDecimal cost = product.getCost();
        if (cost == null || cost.signum() < 0) return null;
        if (product.getShopfrontSourceUpdatedAt() != null
                && !product.getShopfrontSourceUpdatedAt().isBlank()
                && product.getCaseCost() == null) return null;
        return cost;
    }
}
