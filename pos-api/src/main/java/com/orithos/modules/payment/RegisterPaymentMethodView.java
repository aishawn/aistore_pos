package com.orithos.modules.payment;

import lombok.Data;

@Data
public class RegisterPaymentMethodView {
    private Long paymentMethodId;
    private String name;
    private String type;
    private Long registerId;
    private String registerName;
}
