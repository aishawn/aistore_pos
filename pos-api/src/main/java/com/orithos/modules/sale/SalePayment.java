package com.orithos.modules.sale;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** A single tender recorded against a sale (row in {@code sale_payment}). */
@Data
public class SalePayment {
    private Long id;
    private Long saleId;
    private Long paymentMethodId;
    /** Human tender label as tapped on the Sell pad, e.g. "EFTPOS VISA MasterCard". */
    private String subtype;
    private Long registerId;
    private String status;
    private BigDecimal amount;
    private BigDecimal rounding;
    private BigDecimal cashout;
    private LocalDateTime processTime;
}
