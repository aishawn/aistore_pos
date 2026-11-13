package com.orithos.modules.sale.dto;

import java.math.BigDecimal;
import java.util.List;

/** Server-authoritative, read-only price and GST quote for a new POS sale. */
public record CheckoutQuoteResponse(
        List<Line> lines,
        BigDecimal subtotalExGst,
        BigDecimal gst,
        BigDecimal total) {
    public record Line(Long productId, String name, BigDecimal quantity,
                       BigDecimal unitPrice, BigDecimal discountPercent, BigDecimal total, BigDecimal taxRate,
                       BigDecimal gst) {}
}
