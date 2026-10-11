package com.orithos.modules.sell.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.orithos.common.LenientLongDeserializer;
import lombok.Data;
import java.util.List;

@Data
public class ParkSaleRequest {
    private Long registerId;
    private Long userId;
    @JsonDeserialize(using = LenientLongDeserializer.class)
    private Long customerId;
    private String note;
    private List<SellCartItem> items;
}
