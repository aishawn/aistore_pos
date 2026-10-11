package com.orithos.modules.register;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class RegisterClosurePayment {
    private Long id;
    private Long closureId;
    private Long paymentMethodId;
    private BigDecimal expected;
    private BigDecimal received;
}
