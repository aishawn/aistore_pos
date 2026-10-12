package com.orithos.modules.ai.invoice;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
public class InvoiceScanResponse {
    private Long supplierId;
    private String supplierName;
    private String supplierAbn;
    private String supplierWebsite;
    private boolean createSupplier;
    private Long toId;
    private String invoiceNumber;
    private LocalDate invoiceDate;
    private LocalDate dueDate;
    private String customerName;
    private String customerAddress;
    private String attn;
    private String phone;
    private BigDecimal deliveryFee;
    private BigDecimal gstIncluded;
    private BigDecimal totalPayable;
    private BigDecimal totalCases;
    private String notes;
    private String internalNotes;
    private List<InvoiceScanLine> lines = new ArrayList<>();
}
