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
    private String ocrJson;
    private Long confirmedBy;
    private Instant confirmedAt;
    private Instant discardedAt;
    private Instant createdAt;
    private Instant updatedAt;
}
