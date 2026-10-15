package com.orithos.modules.payment;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class PaymentMethod {
    private Long id;
    private String name;
    private String type;
    private BigDecimal surcharge;
    private Boolean alwaysOpenDrawer;
    private Boolean alwaysPrint;
    private Boolean useRounding;
    private Boolean defaultPayExact;
    private String backgroundColour;
    private String textColour;
    private Long outletId;
}
