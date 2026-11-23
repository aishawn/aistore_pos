package com.orithos.modules.order;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Mirrors the {@code purchase_order} table (ORDER is reserved, so the table is named purchase_order). */
@Data
public class Order {
    private Long id;
    private String type;
    private String status;
    private Long fromId;
    private Long toId;
    private LocalDate orderDate;
    private LocalDate dueDate;
    private String enteredAs;
    private String invoiceNumber;
    private String reference;
    private String notes;
    private String internalNotes;
    private Boolean includeFreight;
    private BigDecimal totalCost;
    private BigDecimal expectedTotal;
    private BigDecimal feePercentage;
    /** Sum of ordered_cost × ordered_quantity across imported lines (list honesty). */
    private BigDecimal linesTotalCost;
    private Integer lineCount;
    private Long createdById;
    private Long sentById;
    private Long receivedById;
    private Long mergedIntoId;
    private Long outletId;
    @JsonIgnore
    private Long vendorId;
    private LocalDateTime createdAt;
    private LocalDateTime sentAt;
    private LocalDateTime receivedAt;

    /** Resolved display name for list views (supplier/outlet). */
    private String fromName;
    /** Resolved display name for list views (outlet, supplier, or transferee). */
    private String toName;

    /** Populated on detail fetch via a second mapper query. */
    private List<OrderProduct> products;
    private List<ReceivedBatch> receivedBatches;

    public record ReceivedBatch(Long receiptId, Long orderProductId, String batchCode,
                                LocalDate expiryDate, BigDecimal inventoryQuantity,
                                PurchaseReceiptRequest.DateType dateType) {}
}
