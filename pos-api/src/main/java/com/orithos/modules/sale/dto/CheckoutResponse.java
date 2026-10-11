package com.orithos.modules.sale.dto;

import com.orithos.modules.sale.Sale;
import lombok.Data;
import java.math.BigDecimal;

/** Result of a completed tender: the persisted sale and what to show the operator. */
@Data
public class CheckoutResponse {
    private Sale sale;
    private Long saleId;
    private String invoiceId;
    /** Resolved payment method name, e.g. "EFTPOS". */
    private String paymentMethod;
    /** Resolved tender type, e.g. "CASH" or "EFTPOS". */
    private String tenderType;
    private BigDecimal amountDue;
    /** GST included in the sale total. Shelf prices are GST-inclusive. */
    private BigDecimal gst;
    /** Sale total minus GST. */
    private BigDecimal subtotalExGst;
    /** Cash rounding applied to this tender (nearest 5 cents). Zero for card. */
    private BigDecimal rounding;
    /** Cash the customer must hand over for this tender, after 5c rounding. */
    private BigDecimal cashDue;
    /** Amount recorded for this tender. */
    private BigDecimal tendered;
    /** Change from this tender (cash over-payment). */
    private BigDecimal change;
    private BigDecimal cashout;
    /** Balance still owed after this tender. */
    private BigDecimal remaining;
    /** True once all tenders cover the sale total. */
    private boolean completed;
}
