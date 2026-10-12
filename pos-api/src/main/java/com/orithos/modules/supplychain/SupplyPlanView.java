package com.orithos.modules.supplychain;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
public class SupplyPlanView {
    private Long id;
    private LocalDate weekStart;
    private LocalDate weekEnd;
    private String holidayNote;
    private int productCount;
    private BigDecimal totalUnits;
    private BigDecimal estimatedSpend;
    private BigDecimal estimatedSaving;
    private List<SupplierGroup> ready = new ArrayList<>();
    private List<EmailDraft> emails = new ArrayList<>();
    private List<Line> other = new ArrayList<>();
    private List<Line> lines = new ArrayList<>();

    @Data
    public static class SupplierGroup {
        private Long supplierId;
        private String supplierName;
        private int skuCount;
        private BigDecimal spend;
        private BigDecimal saving;
        private Long orderId;
    }

    @Data
    public static class EmailDraft {
        private Long id;
        private Long supplierId;
        private String supplierName;
        private String toEmail;
        private String subject;
        private String body;
        private String status;
        private int skuCount;
    }

    @Data
    public static class Line {
        private Long id;
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
        private int confidence;
        private String confidenceLabel;
        private boolean unusual;
        private String reason;
        private String decision;
        private String comparisonJson;
        private String status;
        private Long orderId;
    }
}
