package com.orithos.modules.supplychain;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/** MyBatis row types for the supply-chain tables and the read models they join. */
public final class SupplyChainRows {
    private SupplyChainRows() {
    }

    @Data
    public static class DemandRow {
        private Long productId;
        private String productName;
        private BigDecimal caseQuantity;
        private Long coreSupplierId;
        private BigDecimal currentStock;
        private BigDecimal incomingStock;
        private BigDecimal reorderLevel;
        private BigDecimal lastCost;
    }

    @Data
    public static class SalesRow {
        private Long productId;
        private BigDecimal qty;
    }

    @Data
    public static class LinkRow {
        private Long productId;
        private Long supplierId;
        private String supplierSku;
        private Integer moq;
    }

    @Data
    public static class SupplierRow {
        private Long id;
        private String name;
        private String email;
        private BigDecimal freightPerCase;
    }

    @Data
    public static class PriceRow {
        private Long id;
        private Long outletId;
        private Long productId;
        private String productName;
        private Long supplierId;
        private String supplierName;
        private String supplierSku;
        private BigDecimal basePrice;
        private BigDecimal caseSize;
        private LocalDate effectiveFrom;
        private LocalDate effectiveTo;
        private String source;
    }

    @Data
    public static class DealRow {
        private Long id;
        private Long outletId;
        private Long supplierId;
        private String supplierName;
        private String name;
        private String dealType;
        private Integer buyQuantity;
        private Integer freeQuantity;
        private BigDecimal discountPercent;
        private BigDecimal discountAmount;
        private String eligibleProducts;
        private Boolean requiresRep;
        private Boolean mixMatch;
        private LocalDate validFrom;
        private LocalDate validTo;
    }

    @Data
    public static class PrefRow {
        private Long id;
        private Long supplierId;
        private String supplierName;
        private Integer priority;
        private BigDecimal switchThreshold;
        private String channel;
    }

    @Data
    public static class RuleRow {
        private Long id;
        private Long productId;
        private String productName;
        private String supplierMode;
        private Long supplierId;
        private String supplierName;
    }

    @Data
    public static class EventRow {
        private Long id;
        private Long outletId;
        private LocalDate eventDate;
        private String name;
        private BigDecimal demandAdjustment;
        /** Percent points for the settings form. Not a database column. */
        private BigDecimal adjustmentPercent;
    }

    @Data
    public static class PlanRow {
        private Long id;
        private Long outletId;
        private LocalDate weekStart;
        private LocalDate weekEnd;
        private String status;
        private Integer productCount;
        private BigDecimal totalUnits;
        private BigDecimal estimatedSpend;
        private BigDecimal estimatedSaving;
        private String holidayNote;
    }

    @Data
    public static class LineRow {
        private Long id;
        private Long planId;
        private Long outletId;
        private Long productId;
        private String productName;
        private Long supplierId;
        private String supplierName;
        private String supplierSku;
        private String channel;
        private BigDecimal lastWeekSales;
        private BigDecimal currentStock;
        private BigDecimal incomingStock;
        private BigDecimal expectedDemand;
        private BigDecimal safetyStock;
        private BigDecimal orderQty;
        private BigDecimal caseQty;
        private BigDecimal caseSize;
        private BigDecimal unitCost;
        private BigDecimal lineCost;
        private BigDecimal saving;
        private Integer confidence;
        private Boolean unusual;
        private String reason;
        private String decision;
        private String comparisonJson;
        private String status;
        private Long orderId;
    }

    @Data
    public static class DraftRow {
        private Long id;
        private Long planId;
        private Long outletId;
        private Long supplierId;
        private String supplierName;
        private String toEmail;
        private String subject;
        private String body;
        private String status;
        private Integer skuCount;
    }
}
