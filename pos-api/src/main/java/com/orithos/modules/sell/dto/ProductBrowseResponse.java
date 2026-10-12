package com.orithos.modules.sell.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** Sell-pad product folder browse result (Beer / Wines / Spirits / Products). */
@Data
public class ProductBrowseResponse {
    private String folderName;
    private List<Item> items = new ArrayList<>();

    @Data
    public static class Item {
        private Long id;
        private String name;
        private BigDecimal price;
        private String categoryName;
        /** Units per case — used by the Sell pad Case Quantity action. */
        private BigDecimal caseQuantity;
    }
}
