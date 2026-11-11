package com.orithos.modules.ai.invoice;

import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Data
public class InvoiceScanSessionEntity {
    private Long id;
    private Long vendorId;
    private Long createdBy;
    private String status;
    private String sourceType;
    private String supplierName;
    private String supplierAbn;
    private String invoiceNumber;
    private LocalDate invoiceDate;
    private LocalDate dueDate;
    private BigDecimal totalPayable;
    private BigDecimal gstIncluded;
    private Long supplierId;
    private Long outletId;
    private Long purchaseOrderId;
    private String purchaseOrderName;
    private Long receiptId;
    private String receiptName;
    private String sourceFilename;
    private String sourceContentType;
    private String notes;
    private String internalNotes;
    private String ocrJson;
    private Long confirmedBy;
    private Instant confirmedAt;
    private Instant discardedAt;
    private Instant createdAt;
    private Instant updatedAt;
}
