package com.orithos.modules.product;

import lombok.Data;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Filters for GET /api/products (mirrors the live `products(...)` query args). */
@Data
public class ProductQuery {
    private String name;
    private Long categoryId;
    private Long brandId;
    /** Comma-separated brand ids for multi-select (Shopfront brands: [ID]). */
    private String brandIds;
    private Long familyId;
    /** When true, only products with no brand assigned. */
    private Boolean withoutBrand;
    /** Exclude products already assigned to this brand (show unassigned + other brands). */
    private Long excludeBrandId;
    private Long supplierId;
    /** Exclude products already linked to this supplier. */
    private Long excludeSupplierId;
    private Long tagId;
    private String type;
    private Long taxRateId;
    /** Comma-separated retail tax rate ids for multi-select. */
    private String taxRateIds;
    private Long costTaxRateId;
    /** Comma-separated purchase tax rate ids for multi-select. */
    private String costTaxRateIds;
    private String status;
    /** Comma-separated status values for multi-select (ACTIVE,NOT_SELLING,NOT_PURCHASING,NOT_ACTIVE). */
    private String statuses;
    /**
     * Inventory report stock filter (Shopfront report-type semantics):
     * on-hand (quantity > 0) | all | not-zero | only-zero | no-inventory
     */
    private String inventoryLevel;
    /** When set, filters Vii gift-card products (Shopfront {@code INTEGRATED} type). */
    private Boolean viiGiftCard;
    private int page = 1;
    private int size = 10;
    private Long vendorId;
    private Long outletId;

    public int getOffset() {
        return Math.max(0, (page - 1) * size);
    }

    public List<String> getStatusList() {
        return splitCsv(statuses);
    }

    public List<Long> getBrandIdList() {
        return splitIdCsv(brandIds);
    }

    public List<Long> getTaxRateIdList() {
        return splitIdCsv(taxRateIds);
    }

    public List<Long> getCostTaxRateIdList() {
        return splitIdCsv(costTaxRateIds);
    }

    /** Trim search text; status keywords (e.g. "inactive") become a status filter. */
    public void normalize() {
        name = blankToNull(name);
        if (name != null && (statuses == null || statuses.isBlank()) && blankToNull(status) == null) {
            String statusKeyword = matchStatusKeyword(name);
            if (statusKeyword != null) {
                status = statusKeyword;
                name = null;
            }
        }
    }

    /** Maps a search term to a product status when it is an exact status keyword. */
    static String matchStatusKeyword(String term) {
        if (term == null) {
            return null;
        }
        return switch (term.trim().toLowerCase()) {
            case "inactive", "not active", "not_active" -> "NOT_ACTIVE";
            case "active" -> "ACTIVE";
            case "not selling", "not_selling" -> "NOT_SELLING";
            case "not purchasing", "not_purchasing" -> "NOT_PURCHASING";
            case "archived" -> "NOT_ACTIVE";
            default -> null;
        };
    }

    private static List<String> splitCsv(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private static List<Long> splitIdCsv(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(value -> {
                    try {
                        return Long.parseLong(value);
                    } catch (NumberFormatException ignored) {
                        return null;
                    }
                })
                .filter(id -> id != null && id > 0)
                .toList();
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
