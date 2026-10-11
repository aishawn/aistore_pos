package com.orithos.modules.customer;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class CustomerGroup {
    private Long id;
    private String name;
    /** Populated on list queries only. */
    private Long customerCount;
    private Long defaultReceiptId;
    private Long emailReceiptId;
    private Long paymentReceiptId;
    private Long statementTemplateId;
    private Long priceListId;
    private Boolean loyaltyEnabled;
    private Boolean disablePromotions;
    private Boolean allowAccountSales;
    private BigDecimal accountLimit;
    private Boolean autoPrintReceipt;
    private Boolean autoPrintParkedReceipt;
    private Boolean autoEmailReceipt;
    private Boolean autoPrintPaymentReceipt;
    private Boolean requireOrderReference;
    private String creditTerms;
}
