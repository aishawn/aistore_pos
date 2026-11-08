package com.orithos.modules.order;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class PurchaseReceiptLine {
    private Long id;
    private Long receiptId;
    private Long orderProductId;
    private Long productId;
    private BigDecimal receivedQuantity;
    private BigDecimal inventoryQuantity;
    private BigDecimal unitCost;
}
