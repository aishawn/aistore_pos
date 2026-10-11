package com.orithos.modules.customerpayment;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Maps to table customer_payment_allocation. */
@Data
public class CustomerPaymentAllocation {
    private Long id;
    private Long paymentId;
    private Long saleId;
    private BigDecimal amount;
    private LocalDateTime createdAt;
}
