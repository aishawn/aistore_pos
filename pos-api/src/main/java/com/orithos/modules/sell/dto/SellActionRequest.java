package com.orithos.modules.sell.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.orithos.common.LenientLongDeserializer;
import lombok.Data;

@Data
public class SellActionRequest {
    /** Action key, e.g. OPEN_DRAWER, CASE_QUANTITY. */
    private String action;
    @JsonDeserialize(using = LenientLongDeserializer.class)
    private Long productId;
    private Long registerId;
}
