package com.orithos.modules.sale.dto;

import java.math.BigDecimal;

public record RefundResponse(Long refundSaleId, Long originalSaleId, String invoiceId,
                             BigDecimal amount, BigDecimal gst, BigDecimal cashPaid,
                             String reason) {}
