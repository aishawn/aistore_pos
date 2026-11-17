package com.orithos.modules.product;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class Product {
    private Long id;
    private String name;
    private String type;
    private String status;
    private String description;
    private Long categoryId;
    private Long brandId;
    private Long familyId;
    private Long taxRateId;
    private Long costTaxRateId;
    private BigDecimal cost;
    private BigDecimal caseCost;
    private BigDecimal caseQuantity;
    private Boolean costPercentage;
    private Boolean shopfrontCatalogConfirmed;
    private String shopfrontSourceUpdatedAt;
    private Boolean preventManualDiscounts;
    private Boolean requestPrice;
    private Boolean requestQuantity;
    private Boolean trackInventory;
    /** Whether this product appears as a sell-screen shortcut key. Default off. */
    private Boolean showShortcuts;
    /** Alcohol by volume percent. Required when the product is liquor. */
    private BigDecimal abv;
    /** Container size in millilitres. */
    private Integer volumeMl;
    /** Wine region or place of origin. */
    private String region;
    /** Vintage year, or NV. */
    private String vintage;
    private String image;
    private LocalDateTime createdAt;
    // joined / computed for list display
    private String categoryName;
    private String brandName;
    private BigDecimal price;
    /** Populated on read; accepted on update to replace tag associations. */
    private List<Long> tagIds;
    /** Populated on read; accepted on update to replace supplier associations. */
    private List<Long> supplierIds;
    /** Populated on read. */
    private List<ProductBarcode> barcodes;
    /** Total quantity across all outlets. */
    private BigDecimal stockQuantity;
    /** Populated on read. */
    private List<ProductPrice> prices;
    /** Other products in the same family (excludes self). Populated on read. */
    private List<String> familyMemberNames;
    /** Units sold per day for the last 30 Adelaide business days (list views). */
    private List<BigDecimal> performance30d;
}
