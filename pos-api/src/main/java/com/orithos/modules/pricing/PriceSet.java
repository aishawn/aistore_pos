package com.orithos.modules.pricing;

import lombok.Data;

@Data
public class PriceSet {
    private Long id;
    private String name;
    private Long parentId;
}
