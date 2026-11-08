package com.orithos.modules.register;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record RegisterSessionSummary(
        Long sessionId,
        Long registerId,
        LocalDateTime openedAt,
        BigDecimal openingFloat,
        BigDecimal cashMovements,
        BigDecimal expectedCash,
        int transactionCount,
        int unsettledSales,
        int unmappedPayments,
        List<Tender> tenders) {

    public record Tender(Long paymentMethodId, String name, String type, BigDecimal expectedAmount) {}
}
