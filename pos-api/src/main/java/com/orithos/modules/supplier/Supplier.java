package com.orithos.modules.supplier;

import lombok.Data;
import java.math.BigDecimal;

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
    /** Number of non-deleted products linked via product_supplier. */
    private Integer productCount;
}
