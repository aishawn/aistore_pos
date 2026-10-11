package com.orithos.modules.sell.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.orithos.common.LenientLongDeserializer;
import lombok.Data;
import java.math.BigDecimal;

/** A cart line shared by park / resume / search-add flows on the Sell pad. */
@Data
public class SellCartItem {
    @JsonDeserialize(using = LenientLongDeserializer.class)
    private Long productId;
    private String name;
    private BigDecimal quantity;
    private BigDecimal unitPrice;
}
