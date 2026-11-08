package com.orithos.modules.sale;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class Sale {
    private Long id;
    private Long linkedSaleId;
    private String refundReason;
    private String invoiceId;
    private String status;
    private BigDecimal totalPrice;
    private BigDecimal totalTax;
    private BigDecimal totalRounding;
    private BigDecimal outstanding;
    private BigDecimal totalChange;
    private BigDecimal cashout;
    private java.time.LocalDate businessDate;
    private LocalDateTime localSoldAt;
    private Integer totalQuantity;
    private String note;
    private Long userId;
    private Long customerId;
    private Long registerId;
    /** Store the sale belongs to. Daily Sales filters on this column. */
    private Long outletId;
    private LocalDateTime createdAt;
    private String userName;
    private String customerName;
    /** Line items — populated on single-fetch and accepted on create. */
    private List<SaleItem> items;
    /** True when this parked sale is from a previous business day and still within the keep window. */
    private Boolean stale;
    /** Sydney business date on which an overdue parked sale is voided. */
    private java.time.LocalDate clearsOn;
}
