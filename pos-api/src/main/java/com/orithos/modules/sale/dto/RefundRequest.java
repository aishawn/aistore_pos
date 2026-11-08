package com.orithos.modules.sale.dto;

import java.math.BigDecimal;
import java.util.List;

public record RefundRequest(Long registerId, String reason, List<Line> lines) {
    public record Line(Long saleItemId, BigDecimal quantity) {}
}
