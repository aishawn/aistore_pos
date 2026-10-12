package com.orithos.modules.product;

import lombok.Data;

/** One selectable value for the Products page filter dropdowns. */
@Data
public class ProductFilterOption {
    /** Entity id (as string) or product type code. */
    private String id;
    private String name;
    /** Non-deleted products that use this value. */
    private Integer productCount;
}
