package com.orithos.modules.order;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record PurchaseReceiptRequest(List<Line> lines) {
    public record Line(Long orderProductId, BigDecimal quantity, List<Batch> batches) {
        public Line(Long orderProductId, BigDecimal quantity) {
            this(orderProductId, quantity, List.of());
        }
    }

    public record Batch(String code, LocalDate expiryDate, BigDecimal quantity) {}
}
