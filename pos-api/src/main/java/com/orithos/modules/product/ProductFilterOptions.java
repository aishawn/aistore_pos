package com.orithos.modules.product;

import lombok.Data;

import java.util.List;

/**
 * Filter facets derived from values actually referenced by non-deleted products
 * (including soft-deleted master rows still linked from products).
 */
@Data
public class ProductFilterOptions {
    private List<ProductFilterOption> brands;
    private List<ProductFilterOption> categories;
    private List<ProductFilterOption> families;
    private List<ProductFilterOption> tags;
    private List<ProductFilterOption> suppliers;
    private List<ProductFilterOption> types;
    private List<ProductFilterOption> taxRates;
    private List<ProductFilterOption> costTaxRates;
}
