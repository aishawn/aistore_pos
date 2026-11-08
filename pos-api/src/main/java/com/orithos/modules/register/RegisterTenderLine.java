package com.orithos.modules.register;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RegisterTenderLine {
    private Long paymentMethodId;
    private String paymentMethodName;
    private String paymentMethodType;
    private String subtype;
    private Long saleId;
    private BigDecimal amount;
    private BigDecimal rounding;
    private BigDecimal cashout;
    private BigDecimal saleChange;
}
