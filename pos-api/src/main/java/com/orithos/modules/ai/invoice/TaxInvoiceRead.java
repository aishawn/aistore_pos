package com.orithos.modules.ai.invoice;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Structured fields extracted from a supplier tax-invoice photo. */
public record TaxInvoiceRead(
        String supplierName,
        String abn,
        String website,
        String invoiceNumber,
        LocalDate invoiceDate,
        String customerName,
        String customerAddress,
        String attn,
        String phone,
        BigDecimal deliveryFee,
        BigDecimal gstIncluded,
        BigDecimal totalPayable,
        BigDecimal totalCases,
        String notes,
        List<Line> lines
) {
    public record Line(
            String description,
            String brand,
            BigDecimal packQty,
            BigDecimal qtyCases,
            BigDecimal unitPrice,
            BigDecimal lineTotal
    ) {}

    public TaxInvoiceRead {
        lines = lines == null ? List.of() : List.copyOf(lines);
    }
}
