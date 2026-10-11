package com.orithos.modules.order;

import lombok.Data;

import java.time.LocalDate;

/** Payload for POST /api/orders when creating a stock order from the UI. */
@Data
public class CreateOrderRequest {
    /** Supplier id; null means "All Suppliers". */
    private Long fromId;
    /** Destination outlet / transferee id. */
    private Long toId;
    private LocalDate orderDate;
    private LocalDate dueDate;
    /** User-facing order number (stored as invoice_number). */
    private String invoiceNumber;
    private String reference;
    private String notes;
    private String internalNotes;
    /**
     * Optional stock-generation source (REORDER_LEVEL, MINIMUM_STOCK, BUYING_PERIOD).
     * Reserved for future line-generation; not persisted on the order header today.
     */
    private String generateStockFrom;
}
