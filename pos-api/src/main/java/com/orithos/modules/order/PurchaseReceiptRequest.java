package com.orithos.modules.order;

import java.math.BigDecimal;
import java.util.List;

public record PurchaseReceiptRequest(List<Line> lines) {
    public record Line(Long orderProductId, BigDecimal quantity) {}
}
