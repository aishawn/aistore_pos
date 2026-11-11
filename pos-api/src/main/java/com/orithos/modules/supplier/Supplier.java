package com.orithos.modules.supplier;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class Supplier {
    private Long id;
    private String name;
    private Integer mdbId;
    private String status;
    private Long contactId;
    private String businessNumber;
    private String accountNumber;
    private String phone;
    private String email;
    private String orderNotes;
    private String comments;
    private BigDecimal minimumOrderValue;
    private Integer defaultDaysUntilDue;
    /**
     * Distinct non-deleted products linked via product_supplier, core_supplier_id,
     * or historical order_product lines for this supplier.
     */
    private Integer productCount;
    /** Units sold per Adelaide business day for the past 30 days (oldest → newest). */
    private List<Double> performance30d;
}
