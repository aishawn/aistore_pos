package com.orithos.modules.customerpayment;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Maps to table customer_payment. */
@Data
public class CustomerPayment {
    private Long outletId;
    private Long id;
    private Long customerId;
    private Long paymentMethodId;
    private Long userId;
    private Long registerId;
    private String reference;
    private String status;
    private BigDecimal startBalance;
    private BigDecimal amount;
    private BigDecimal rounding;
    private LocalDateTime timestamp;
    private Long relatesToId;
    private LocalDateTime cancelledAt;
    private String paymentMethodName;
    private String userName;
}
