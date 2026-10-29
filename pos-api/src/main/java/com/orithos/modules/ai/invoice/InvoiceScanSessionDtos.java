package com.orithos.modules.ai.invoice;

import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

public final class InvoiceScanSessionDtos {
    private InvoiceScanSessionDtos() {}

    @Data
    public static class LineInput {
        private Long id;
        private String description;
        private String brand;
        private BigDecimal packQty;
        private BigDecimal qtyCases;
        private BigDecimal unitPrice;
        private BigDecimal lineTotal;
        private Long odooProductId;
        private String odooProductName;
        private String matchStatus;
        private BigDecimal confidence;
    }

    @Data
    public static class SaveRequest {
        private boolean reviewConfirmed;
        private String sourceType;
        private String sourceFilename;
        private String sourceContentType;
        private String supplierName;
        private String supplierAbn;
        private String invoiceNumber;
        private LocalDate invoiceDate;
        private LocalDate dueDate;
        private BigDecimal totalPayable;
        private BigDecimal gstIncluded;
        private Long odooSupplierId;
        private Long odooOutletId;
        private String notes;
        private String internalNotes;
        private List<LineInput> lines = new ArrayList<>();
    }

    @Data
    public static class PatchRequest {
        private String supplierName;
        private String supplierAbn;
        private String invoiceNumber;
        private LocalDate invoiceDate;
        private LocalDate dueDate;
        private BigDecimal totalPayable;
        private BigDecimal gstIncluded;
        private Long odooSupplierId;
        private Long odooOutletId;
        private String notes;
        private String internalNotes;
        private List<LineInput> lines;
    }

    @Data
    public static class LinkPurchaseRequest {
        private Long odooPoId;
        private String odooPoName;
        private Long odooPickingId;
        private String odooPickingName;
        private String status;
    }

    @Data
    public static class LineView {
        private Long id;
        private int lineIndex;
        private String description;
        private String brand;
        private BigDecimal packQty;
        private BigDecimal qtyCases;
        private BigDecimal unitPrice;
        private BigDecimal lineTotal;
        private Long odooProductId;
        private String odooProductName;
        private String matchStatus;
        private BigDecimal confidence;
    }

    @Data
    public static class SessionView {
        private Long id;
        private String status;
        private String sourceType;
        private String supplierName;
        private String supplierAbn;
        private String invoiceNumber;
        private LocalDate invoiceDate;
        private LocalDate dueDate;
        private BigDecimal totalPayable;
        private BigDecimal gstIncluded;
        private Long odooSupplierId;
        private Long odooOutletId;
        private Long odooPoId;
        private String odooPoName;
        private Long odooPickingId;
        private String odooPickingName;
        private String sourceFilename;
        private String sourceContentType;
        private String notes;
        private String internalNotes;
        private List<Long> duplicateIds = new ArrayList<>();
        private Instant createdAt;
        private Instant updatedAt;
        private Instant confirmedAt;
        private List<LineView> lines = new ArrayList<>();
    }

    @Data
    public static class ListResponse {
        private List<SessionView> items = new ArrayList<>();
        private long total;
        private int limit;
        private int offset;
    }
}
